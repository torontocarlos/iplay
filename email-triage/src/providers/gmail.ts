import { google } from "googleapis";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import type { EmailProvider, EmailMessage, ListOptions } from "../types.js";

const TOKEN_PATH = "tokens/gmail-token.json";
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.compose",
];

export class GmailProvider implements EmailProvider {
  name = "gmail";
  private auth;
  private gmail;

  constructor() {
    this.auth = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    );
    this.gmail = google.gmail({ version: "v1", auth: this.auth });
  }

  async authenticate(): Promise<void> {
    if (!existsSync("tokens")) mkdirSync("tokens");

    if (existsSync(TOKEN_PATH)) {
      const token = JSON.parse(readFileSync(TOKEN_PATH, "utf-8"));
      this.auth.setCredentials(token);
      if (token.expiry_date && token.expiry_date < Date.now()) {
        const { credentials } = await this.auth.refreshAccessToken();
        this.auth.setCredentials(credentials);
        writeFileSync(TOKEN_PATH, JSON.stringify(credentials));
      }
      return;
    }

    throw new Error(
      "No Gmail token found. Run `npm run auth:gmail` to authenticate first."
    );
  }

  async listMessages(options: ListOptions = {}): Promise<EmailMessage[]> {
    const queryParts: string[] = [];
    if (options.unreadOnly) queryParts.push("is:unread");
    if (options.olderThan) queryParts.push(`before:${formatDate(options.olderThan)}`);
    if (options.newerThan) queryParts.push(`after:${formatDate(options.newerThan)}`);
    if (options.query) queryParts.push(options.query);

    const res = await this.gmail.users.messages.list({
      userId: "me",
      maxResults: options.maxResults || 50,
      q: queryParts.join(" ") || undefined,
    });

    const messages: EmailMessage[] = [];
    for (const msg of res.data.messages || []) {
      const full = await this.getMessage(msg.id!);
      messages.push(full);
    }
    return messages;
  }

  async getMessage(id: string): Promise<EmailMessage> {
    const res = await this.gmail.users.messages.get({
      userId: "me",
      id,
      format: "full",
    });

    const headers = res.data.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

    const from = parseEmailAddress(getHeader("From"));
    const to = getHeader("To").split(",").map(parseEmailAddress);
    const cc = getHeader("Cc") ? getHeader("Cc").split(",").map(parseEmailAddress) : undefined;

    return {
      id: res.data.id!,
      threadId: res.data.threadId || undefined,
      provider: "gmail",
      from,
      to,
      cc,
      subject: getHeader("Subject"),
      body: extractBody(res.data.payload),
      snippet: res.data.snippet || undefined,
      date: new Date(parseInt(res.data.internalDate || "0")),
      isRead: !res.data.labelIds?.includes("UNREAD"),
      labels: res.data.labelIds || undefined,
      hasAttachments: hasAttachments(res.data.payload),
    };
  }

  async archiveMessage(id: string): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: "me",
      id,
      requestBody: { removeLabelIds: ["INBOX"] },
    });
  }

  async deleteMessage(id: string): Promise<void> {
    await this.gmail.users.messages.trash({ userId: "me", id });
  }

  async labelMessage(id: string, labels: string[]): Promise<void> {
    const existingLabels = await this.gmail.users.labels.list({ userId: "me" });
    const labelIds: string[] = [];

    for (const labelName of labels) {
      let label = existingLabels.data.labels?.find(
        (l) => l.name?.toLowerCase() === labelName.toLowerCase()
      );
      if (!label) {
        const created = await this.gmail.users.labels.create({
          userId: "me",
          requestBody: { name: labelName, labelListVisibility: "labelShow" },
        });
        label = created.data;
      }
      if (label.id) labelIds.push(label.id);
    }

    await this.gmail.users.messages.modify({
      userId: "me",
      id,
      requestBody: { addLabelIds: labelIds },
    });
  }

  async createDraft(to: string, subject: string, body: string, inReplyTo?: string): Promise<void> {
    const raw = createRawEmail(to, subject, body, inReplyTo);
    await this.gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw, threadId: inReplyTo } },
    });
  }

  async sendReply(to: string, subject: string, body: string, inReplyTo?: string): Promise<void> {
    const raw = createRawEmail(to, subject, body, inReplyTo);
    await this.gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, threadId: inReplyTo },
    });
  }

  async markAsRead(id: string): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: "me",
      id,
      requestBody: { removeLabelIds: ["UNREAD"] },
    });
  }
}

function parseEmailAddress(raw: string): { name?: string; email: string } {
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { name: match[1].replace(/"/g, "").trim(), email: match[2].trim() };
  return { email: raw.trim() };
}

function extractBody(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }
  if (payload.parts) {
    const textPart = payload.parts.find((p: any) => p.mimeType === "text/plain");
    if (textPart?.body?.data) {
      return Buffer.from(textPart.body.data, "base64url").toString("utf-8");
    }
    const htmlPart = payload.parts.find((p: any) => p.mimeType === "text/html");
    if (htmlPart?.body?.data) {
      return Buffer.from(htmlPart.body.data, "base64url").toString("utf-8")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }
  return "";
}

function hasAttachments(payload: any): boolean {
  if (!payload) return false;
  if (payload.filename && payload.filename.length > 0) return true;
  if (payload.parts) return payload.parts.some(hasAttachments);
  return false;
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function createRawEmail(to: string, subject: string, body: string, inReplyTo?: string): string {
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
    "",
    body,
  ];
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}
