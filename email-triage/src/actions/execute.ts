import type { EmailProvider, TriageResult } from "../types.js";
import { config } from "../config.js";

export async function executeAction(
  provider: EmailProvider,
  result: TriageResult
): Promise<{ executed: boolean; description: string }> {
  const { email, action } = result;

  switch (action.type) {
    case "archive":
      await provider.archiveMessage(email.id);
      await provider.markAsRead(email.id);
      return { executed: true, description: `Archived: "${email.subject}"` };

    case "delete":
      await provider.deleteMessage(email.id);
      return { executed: true, description: `Deleted: "${email.subject}"` };

    case "label":
      await provider.labelMessage(email.id, action.labels);
      return { executed: true, description: `Labeled [${action.labels.join(", ")}]: "${email.subject}"` };

    case "draft-reply":
      if (config.draftReviewRequired) {
        await provider.createDraft(
          email.from.email,
          `Re: ${email.subject}`,
          action.body,
          email.threadId || email.id
        );
        return { executed: true, description: `Draft created for: "${email.subject}"` };
      } else {
        await provider.sendReply(
          email.from.email,
          `Re: ${email.subject}`,
          action.body,
          email.threadId || email.id
        );
        return { executed: true, description: `Auto-replied to: "${email.subject}"` };
      }

    case "auto-reply":
      if (!config.autoReplyEnabled) {
        await provider.createDraft(
          email.from.email,
          `Re: ${email.subject}`,
          action.body,
          email.threadId || email.id
        );
        return { executed: true, description: `Draft created (auto-reply disabled): "${email.subject}"` };
      }
      await provider.sendReply(
        email.from.email,
        `Re: ${email.subject}`,
        action.body,
        email.threadId || email.id
      );
      return { executed: true, description: `Auto-replied: "${email.subject}"` };

    case "flag-human":
      await provider.labelMessage(email.id, ["needs-attention"]);
      return { executed: true, description: `Flagged for review (${action.reason}): "${email.subject}"` };

    default:
      return { executed: false, description: `Unknown action for: "${email.subject}"` };
  }
}
