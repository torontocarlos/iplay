import { Client } from "@microsoft/microsoft-graph-client";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import type { EmailProvider, EmailMessage, ListOptions } from "../types.js";

const TOKEN_PATH = "tokens/outlook-token.json";

export class OutlookProvider implements EmailProvider {
  name = "outlook";
  private client!: Client;

  async authenticate(): Promise<void> {
    if (!existsSync(TOKEN_PATH)) {
      throw new Error(
        "No Outlook token found. Run `npm run auth:outlook` to authenticate first."
      );
    }

    const tokenData = JSON.parse(readFileSync(TOKEN_PATH, "utf-8"));
    let accessToken = tokenData.access_token;

    if (tokenData.expires_at && tokenData.expires_at < Date.now()) {
      accessToken = await this.refreshToken(tokenData.refresh_token);
    }

    this.client = Client.init({
      authProvider: (done) => done(null, accessToken),
    });
  }

  private async refreshToken(refreshToken: string): Promise<string> {
    const params = new URLSearchParams({
      client_id: process.env.OUTLOOK_CLIENT_ID!,
      client_secret: process.env.OUTLOOK_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: "Mail.ReadWrite Mail.Send offline_access",
    });

    const res = await fetch(
      `https://login.microsoftonline.com/${process.env.OUTLOOK_TENANT_ID || "common"}/oauth2/v2.0/token`,
      { method: "POST", body: params }
    );

    const data = await res.json();
    const tokenData = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      expires_at: Date.now() + data.expires_in * 1000,
    };
    writeFileSync(TOKEN_PATH, JSON.stringify(tokenData, null, 2));
    return data.access_token;
  }

  async listMessages(options: ListOptions = {}): Promise<EmailMessage[]> {
    let endpoint = "/me/mailFolders/inbox/messages";
    const queryParams: string[] = [];
    const filters: string[] = [];

    queryParams.push(`$top=${options.maxResults || 50}`);
    queryParams.push("$orderby=receivedDateTime desc");
    queryParams.push("$select=id,conversationId,from,toRecipients,ccRecipients,subject,bodyPreview,body,receivedDateTime,isRead,hasAttachments,categories");

    if (options.unreadOnly) filters.push("isRead eq false");
    if (options.olderThan) filters.push(`receivedDateTime lt ${options.olderThan.toISOString()}`);
    if (options.newerThan) filters.push(`receivedDateTime gt ${options.newerThan.toISOString()}`);

    if (filters.length) queryParams.push(`$filter=${filters.join(" and ")}`);
    if (options.query) queryParams.push(`$search="${options.query}"`);

    const url = `${endpoint}?${queryParams.join("&")}`;
    const res = await this.client.api(url).get();

    return (res.value || []).map(this.transformMessage);
  }

  async getMessage(id: string): Promise<EmailMessage> {
    const msg = await this.client
      .api(`/me/messages/${id}`)
      .select("id,conversationId,from,toRecipients,ccRecipients,subject,bodyPreview,body,receivedDateTime,isRead,hasAttachments,categories")
      .get();
    return this.transformMessage(msg);
  }

  async archiveMessage(id: string): Promise<void> {
    const archiveFolder = await this.getOrCreateFolder("Archive");
    await this.client.api(`/me/messages/${id}/move`).post({
      destinationId: archiveFolder.id,
    });
  }

  async deleteMessage(id: string): Promise<void> {
    await this.client.api(`/me/messages/${id}`).delete();
  }

  async labelMessage(id: string, labels: string[]): Promise<void> {
    await this.client.api(`/me/messages/${id}`).patch({
      categories: labels,
    });
  }

  async createDraft(to: string, subject: string, body: string, inReplyTo?: string): Promise<void> {
    if (inReplyTo) {
      await this.client.api(`/me/messages/${inReplyTo}/createReply`).post({}).then(async (draft: any) => {
        await this.client.api(`/me/messages/${draft.id}`).patch({
          body: { contentType: "Text", content: body },
        });
      });
    } else {
      await this.client.api("/me/messages").post({
        subject,
        body: { contentType: "Text", content: body },
        toRecipients: [{ emailAddress: { address: to } }],
        isDraft: true,
      });
    }
  }

  async sendReply(to: string, subject: string, body: string, inReplyTo?: string): Promise<void> {
    if (inReplyTo) {
      await this.client.api(`/me/messages/${inReplyTo}/reply`).post({
        comment: body,
      });
    } else {
      await this.client.api("/me/sendMail").post({
        message: {
          subject,
          body: { contentType: "Text", content: body },
          toRecipients: [{ emailAddress: { address: to } }],
        },
      });
    }
  }

  async markAsRead(id: string): Promise<void> {
    await this.client.api(`/me/messages/${id}`).patch({ isRead: true });
  }

  private async getOrCreateFolder(name: string) {
    const folders = await this.client.api("/me/mailFolders").filter(`displayName eq '${name}'`).get();
    if (folders.value?.length) return folders.value[0];
    return await this.client.api("/me/mailFolders").post({ displayName: name });
  }

  private transformMessage(msg: any): EmailMessage {
    return {
      id: msg.id,
      threadId: msg.conversationId,
      provider: "outlook",
      from: {
        name: msg.from?.emailAddress?.name,
        email: msg.from?.emailAddress?.address || "",
      },
      to: (msg.toRecipients || []).map((r: any) => ({
        name: r.emailAddress?.name,
        email: r.emailAddress?.address || "",
      })),
      cc: msg.ccRecipients?.length
        ? msg.ccRecipients.map((r: any) => ({
            name: r.emailAddress?.name,
            email: r.emailAddress?.address || "",
          }))
        : undefined,
      subject: msg.subject || "",
      body: msg.body?.content
        ? msg.body.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        : "",
      snippet: msg.bodyPreview,
      date: new Date(msg.receivedDateTime),
      isRead: msg.isRead ?? false,
      labels: msg.categories,
      hasAttachments: msg.hasAttachments ?? false,
    };
  }
}
