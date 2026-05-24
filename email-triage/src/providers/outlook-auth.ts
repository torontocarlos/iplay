import "dotenv/config";
import { createServer } from "http";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import open from "open";

const SCOPES = "Mail.ReadWrite Mail.Send offline_access";

async function authenticate() {
  const clientId = process.env.OUTLOOK_CLIENT_ID!;
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET!;
  const tenantId = process.env.OUTLOOK_TENANT_ID || "common";
  const redirectUri = process.env.OUTLOOK_REDIRECT_URI!;

  const authUrl = new URL(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`
  );
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("response_mode", "query");

  console.log("Opening browser for Outlook authentication...");

  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://localhost:3000`);
    const code = url.searchParams.get("code");

    if (code) {
      const tokenRes = await fetch(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
            scope: SCOPES,
          }),
        }
      );

      const data = await tokenRes.json();

      if (!existsSync("tokens")) mkdirSync("tokens");
      writeFileSync(
        "tokens/outlook-token.json",
        JSON.stringify({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: Date.now() + data.expires_in * 1000,
        }, null, 2)
      );

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<h1>Outlook authenticated! You can close this tab.</h1>");
      console.log("Outlook token saved to tokens/outlook-token.json");
      server.close();
      process.exit(0);
    } else {
      res.writeHead(400);
      res.end("No code received");
    }
  });

  server.listen(3000, () => {
    console.log("Waiting for OAuth callback on http://localhost:3000...");
    open(authUrl.toString());
  });
}

authenticate().catch(console.error);
