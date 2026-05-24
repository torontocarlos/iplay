import "dotenv/config";
import type { UserConfig, TriageRule } from "./types.js";

const defaultRules: TriageRule[] = [
  {
    name: "auto-archive-noreply",
    condition: (email) => email.from.email.includes("noreply@") || email.from.email.includes("no-reply@"),
    action: { type: "label", labels: ["notification"] },
    skipAI: true,
  },
  {
    name: "auto-archive-unsubscribe-newsletters",
    condition: (email) => email.body.toLowerCase().includes("unsubscribe") && !email.body.toLowerCase().includes("?"),
    action: { type: "label", labels: ["newsletter"] },
  },
];

export const config: UserConfig = {
  providers: ["gmail", "outlook"],
  rules: defaultRules,
  autoReplyEnabled: process.env.AUTO_REPLY === "true",
  draftReviewRequired: true,
  batchSize: parseInt(process.env.BATCH_SIZE || "50", 10),
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || "300000", 10),
  personalContext: `
    I am a busy professional. Here's how I want my email triaged:
    - Urgent: emails from my manager, time-sensitive requests, meeting conflicts
    - Needs reply: direct questions to me, invitations needing RSVP, action items
    - FYI: CC'd emails, team updates, project status updates
    - Newsletter: marketing emails, blog digests, promotional content
    - Notification: automated alerts, shipping updates, password resets
    - Spam: unsolicited sales pitches, phishing attempts
    - Archive: old threads with no action needed, already-handled items

    When drafting replies, be concise and professional. Match my tone (friendly but brief).
  `,
};
