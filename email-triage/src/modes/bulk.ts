import "dotenv/config";
import type { EmailProvider, TriageResult } from "../types.js";
import { classifyBatch } from "../engine/classifier.js";
import { applyRules } from "../engine/rules.js";
import { executeAction } from "../actions/execute.js";
import { config } from "../config.js";
import { GmailProvider } from "../providers/gmail.js";
import { OutlookProvider } from "../providers/outlook.js";

interface BulkStats {
  total: number;
  processed: number;
  archived: number;
  deleted: number;
  drafted: number;
  labeled: number;
  flagged: number;
  errors: number;
}

async function runBulkTriage(provider: EmailProvider) {
  console.log(`\n[bulk] Starting backlog triage for ${provider.name}...`);
  console.log(`[bulk] Batch size: ${config.batchSize}`);
  console.log(`[bulk] Auto-reply: ${config.autoReplyEnabled ? "ON" : "OFF (drafts only)"}`);
  console.log("");

  const stats: BulkStats = {
    total: 0,
    processed: 0,
    archived: 0,
    deleted: 0,
    drafted: 0,
    labeled: 0,
    flagged: 0,
    errors: 0,
  };

  let hasMore = true;
  let page = 0;

  while (hasMore) {
    page++;
    console.log(`[bulk] Fetching batch ${page}...`);

    const emails = await provider.listMessages({
      maxResults: config.batchSize,
      unreadOnly: false,
    });

    if (emails.length === 0) {
      hasMore = false;
      break;
    }

    stats.total += emails.length;

    const needsAI: typeof emails = [];
    const ruleResults: TriageResult[] = [];

    for (const email of emails) {
      const ruleMatch = applyRules(email);
      if (ruleMatch?.skipAI) {
        ruleResults.push({
          email,
          category: "notification",
          confidence: 1.0,
          suggestedLabels: [],
          reasoning: "Matched rule",
          action: ruleMatch.action,
        });
      } else {
        needsAI.push(email);
      }
    }

    let aiResults: TriageResult[] = [];
    if (needsAI.length > 0) {
      console.log(`[bulk]   Classifying ${needsAI.length} emails with AI...`);
      try {
        aiResults = await classifyBatch(needsAI);
      } catch (err) {
        console.error(`[bulk]   AI classification failed, falling back to individual:`, err);
        for (const email of needsAI) {
          try {
            const { classifyEmail } = await import("../engine/classifier.js");
            aiResults.push(await classifyEmail(email));
          } catch {
            stats.errors++;
          }
        }
      }
    }

    const allResults = [...ruleResults, ...aiResults];

    for (const result of allResults) {
      try {
        const { description } = await executeAction(provider, result);
        stats.processed++;

        switch (result.action.type) {
          case "archive": stats.archived++; break;
          case "delete": stats.deleted++; break;
          case "draft-reply":
          case "auto-reply": stats.drafted++; break;
          case "label": stats.labeled++; break;
          case "flag-human": stats.flagged++; break;
        }

        console.log(`  [${result.category}] ${description}`);
      } catch (err) {
        stats.errors++;
        console.error(`  [error] Failed to process: "${result.email.subject}" -`, err);
      }
    }

    console.log(`[bulk] Progress: ${stats.processed}/${stats.total} processed`);

    if (emails.length < config.batchSize) {
      hasMore = false;
    }
  }

  console.log(`\n[bulk] === COMPLETE ===`);
  console.log(`[bulk] Total emails: ${stats.total}`);
  console.log(`[bulk] Processed:    ${stats.processed}`);
  console.log(`[bulk] Archived:     ${stats.archived}`);
  console.log(`[bulk] Deleted:      ${stats.deleted}`);
  console.log(`[bulk] Drafts:       ${stats.drafted}`);
  console.log(`[bulk] Labeled:      ${stats.labeled}`);
  console.log(`[bulk] Flagged:      ${stats.flagged}`);
  console.log(`[bulk] Errors:       ${stats.errors}`);
}

async function main() {
  const providerArg = process.argv[2] || "outlook";

  let provider: EmailProvider;
  if (providerArg === "gmail") {
    provider = new GmailProvider();
  } else {
    provider = new OutlookProvider();
  }

  await provider.authenticate();
  await runBulkTriage(provider);
}

main().catch(console.error);
