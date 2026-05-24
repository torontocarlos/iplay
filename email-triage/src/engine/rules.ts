import type { EmailMessage, TriageResult, TriageAction } from "../types.js";
import { config } from "../config.js";

export function applyRules(email: EmailMessage): { action: TriageAction; skipAI: boolean } | null {
  for (const rule of config.rules) {
    if (rule.condition(email)) {
      return { action: rule.action, skipAI: rule.skipAI ?? false };
    }
  }
  return null;
}
