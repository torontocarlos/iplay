# Email Triage

AI-powered email auto-triage and response engine. Reads your inbox, classifies every email, and takes action: archive, label, draft replies, or flag for human attention.

Supports **Gmail** and **Outlook/Microsoft 365**.

## Quick Start

```bash
cd email-triage
npm install
cp .env.example .env
# Fill in your API keys (see Setup below)
```

## Setup

### 1. Anthropic API Key

Get one at https://console.anthropic.com — add to `.env` as `ANTHROPIC_API_KEY`.

### 2. Gmail Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project, enable the Gmail API
3. Create OAuth2 credentials (Desktop app type)
4. Add client ID/secret to `.env`
5. Run `npm run auth:gmail` — authenticates in your browser

### 3. Outlook Setup

1. Go to [Azure Portal > App Registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps)
2. Register a new app, add redirect URI `http://localhost:3000/oauth/callback`
3. Under API Permissions, add `Mail.ReadWrite` and `Mail.Send` (delegated)
4. Create a client secret
5. Add client ID/secret/tenant to `.env`
6. Run `npm run auth:outlook` — authenticates in your browser

## Usage

### Realtime mode (poll every 5 min)

```bash
npm run dev -- gmail realtime
npm run dev -- outlook realtime
```

### Bulk backlog mode (clear those 20k emails)

```bash
npm run bulk -- outlook
npm run bulk -- gmail
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev -- <provider> realtime` | Poll for new emails continuously |
| `npm run bulk -- <provider>` | Process entire backlog |
| `npm run auth:gmail` | Authenticate Gmail |
| `npm run auth:outlook` | Authenticate Outlook |

## How It Works

1. **Rules engine** — Fast pattern matching (no-reply senders, newsletters) skips AI entirely
2. **AI classification** — Claude classifies each email into: urgent, needs-reply, fyi, newsletter, notification, spam, archive
3. **Action execution** — Archives, labels, creates draft replies, or flags for human review
4. **Safety first** — Auto-reply is OFF by default. Replies go to Drafts for your review.

## Configuration

Edit `src/config.ts` to customize:
- Triage rules (pattern-based, no AI needed)
- Personal context (tell the AI about your role, preferences, VIPs)
- Auto-reply behavior
- Batch sizes and poll intervals

## Cost Estimate

Using Claude Sonnet for classification:
- ~$0.003 per email (individual classification)
- ~$0.001 per email (batch mode, amortized)
- 20,000 email backlog ≈ $20-60 depending on email length
