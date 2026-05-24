export interface EmailMessage {
  id: string;
  threadId?: string;
  provider: "gmail" | "outlook";
  from: { name?: string; email: string };
  to: { name?: string; email: string }[];
  cc?: { name?: string; email: string }[];
  subject: string;
  body: string;
  snippet?: string;
  date: Date;
  isRead: boolean;
  labels?: string[];
  hasAttachments: boolean;
}

export type TriageCategory =
  | "urgent"
  | "needs-reply"
  | "fyi"
  | "newsletter"
  | "notification"
  | "spam"
  | "archive";

export interface TriageResult {
  email: EmailMessage;
  category: TriageCategory;
  confidence: number;
  suggestedReply?: string;
  suggestedLabels: string[];
  reasoning: string;
  action: TriageAction;
}

export type TriageAction =
  | { type: "archive" }
  | { type: "delete" }
  | { type: "label"; labels: string[] }
  | { type: "draft-reply"; body: string }
  | { type: "auto-reply"; body: string }
  | { type: "flag-human"; reason: string };

export interface EmailProvider {
  name: string;
  authenticate(): Promise<void>;
  listMessages(options: ListOptions): Promise<EmailMessage[]>;
  getMessage(id: string): Promise<EmailMessage>;
  archiveMessage(id: string): Promise<void>;
  deleteMessage(id: string): Promise<void>;
  labelMessage(id: string, labels: string[]): Promise<void>;
  createDraft(to: string, subject: string, body: string, inReplyTo?: string): Promise<void>;
  sendReply(to: string, subject: string, body: string, inReplyTo?: string): Promise<void>;
  markAsRead(id: string): Promise<void>;
}

export interface ListOptions {
  maxResults?: number;
  unreadOnly?: boolean;
  olderThan?: Date;
  newerThan?: Date;
  query?: string;
}

export interface TriageRule {
  name: string;
  condition: (email: EmailMessage) => boolean;
  action: TriageAction;
  skipAI?: boolean;
}

export interface UserConfig {
  providers: ("gmail" | "outlook")[];
  rules: TriageRule[];
  autoReplyEnabled: boolean;
  draftReviewRequired: boolean;
  batchSize: number;
  pollIntervalMs: number;
  personalContext: string;
}
