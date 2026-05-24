import type { EmailProvider, TriageResult } from "../types.js";
import { classifyEmail } from "../engine/classifier.js";
import { applyRules } from "../engine/rules.js";
import { executeAction } from "../actions/execute.js";
import { config } from "../config.js";

export async function startRealtimeMode(provider: EmailProvider): Promise<void> {
  console.log(`[realtime] Starting poll loop (every ${config.pollIntervalMs / 1000}s)...`);

  while (true) {
    try {
      const emails = await provider.listMessages({
        unreadOnly: true,
        maxResults: config.batchSize,
      });

      if (emails.length === 0) {
        console.log(`[realtime] No new emails.`);
      } else {
        console.log(`[realtime] Processing ${emails.length} new emails...`);

        for (const email of emails) {
          const ruleMatch = applyRules(email);

          let result: TriageResult;
          if (ruleMatch?.skipAI) {
            result = {
              email,
              category: "notification",
              confidence: 1.0,
              suggestedLabels: [],
              reasoning: "Matched rule",
              action: ruleMatch.action,
            };
          } else {
            result = await classifyEmail(email);
          }

          const { description } = await executeAction(provider, result);
          console.log(`  [${result.category}] ${description}`);
        }
      }
    } catch (err) {
      console.error("[realtime] Error:", err);
    }

    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }
}
