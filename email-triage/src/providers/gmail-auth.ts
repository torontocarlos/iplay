import "dotenv/config";
import { google } from "googleapis";
import { createServer } from "http";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import open from "open";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.compose",
];

async function authenticate() {
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );

  const authUrl = auth.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.log("Opening browser for Gmail authentication...");

  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://localhost:3000`);
    const code = url.searchParams.get("code");

    if (code) {
      const { tokens } = await auth.getToken(code);
      if (!existsSync("tokens")) mkdirSync("tokens");
      writeFileSync("tokens/gmail-token.json", JSON.stringify(tokens, null, 2));
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<h1>Gmail authenticated! You can close this tab.</h1>");
      console.log("Gmail token saved to tokens/gmail-token.json");
      server.close();
      process.exit(0);
    } else {
      res.writeHead(400);
      res.end("No code received");
    }
  });

  server.listen(3000, () => {
    console.log("Waiting for OAuth callback on http://localhost:3000...");
    open(authUrl);
  });
}

authenticate().catch(console.error);
