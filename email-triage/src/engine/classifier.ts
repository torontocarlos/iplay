import Anthropic from "@anthropic-ai/sdk";
import type { EmailMessage, TriageResult, TriageCategory, TriageAction } from "../types.js";
import { config } from "../config.js";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are an email triage assistant. Your job is to classify emails and suggest actions.

${config.personalContext}

For each email, respond with JSON (no markdown):
{
  "category": "urgent" | "needs-reply" | "fyi" | "newsletter" | "notification" | "spam" | "archive",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "suggestedLabels": ["label1", "label2"],
  "action": { "type": "archive" | "delete" | "label" | "draft-reply" | "flag-human", ... },
  "suggestedReply": "reply text if action is draft-reply, otherwise null"
}

Action type details:
- "archive": move out of inbox
- "delete": for spam/junk
- "label": { "type": "label", "labels": [...] }
- "draft-reply": { "type": "draft-reply", "body": "..." } — create a draft for human review
- "flag-human": { "type": "flag-human", "reason": "..." } — needs human attention`;

export async function classifyEmail(email: EmailMessage): Promise<TriageResult> {
  const emailSummary = formatEmailForClassification(email);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Classify this email:\n\n${emailSummary}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const result = JSON.parse(text);

  return {
    email,
    category: result.category as TriageCategory,
    confidence: result.confidence,
    suggestedReply: result.suggestedReply || undefined,
    suggestedLabels: result.suggestedLabels || [],
    reasoning: result.reasoning,
    action: result.action as TriageAction,
  };
}

export async function classifyBatch(emails: EmailMessage[]): Promise<TriageResult[]> {
  const emailSummaries = emails
    .map((e, i) => `--- Email ${i + 1} ---\n${formatEmailForClassification(e)}`)
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT + `\n\nYou will receive multiple emails. Respond with a JSON array of results, one per email, in the same order.`,
    messages: [
      {
        role: "user",
        content: `Classify these ${emails.length} emails:\n\n${emailSummaries}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const results = JSON.parse(text);

  return results.map((result: any, i: number) => ({
    email: emails[i],
    category: result.category as TriageCategory,
    confidence: result.confidence,
    suggestedReply: result.suggestedReply || undefined,
    suggestedLabels: result.suggestedLabels || [],
    reasoning: result.reasoning,
    action: result.action as TriageAction,
  }));
}

function formatEmailForClassification(email: EmailMessage): string {
  const body = email.body.length > 2000 ? email.body.slice(0, 2000) + "..." : email.body;
  return [
    `From: ${email.from.name || ""} <${email.from.email}>`,
    `To: ${email.to.map((t) => t.email).join(", ")}`,
    email.cc ? `CC: ${email.cc.map((c) => c.email).join(", ")}` : null,
    `Subject: ${email.subject}`,
    `Date: ${email.date.toISOString()}`,
    `Read: ${email.isRead}`,
    `Attachments: ${email.hasAttachments}`,
    `---`,
    body,
  ]
    .filter(Boolean)
    .join("\n");
}
