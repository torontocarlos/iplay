import "dotenv/config";
import { GmailProvider } from "./providers/gmail.js";
import { OutlookProvider } from "./providers/outlook.js";
import { startRealtimeMode } from "./modes/realtime.js";
import type { EmailProvider } from "./types.js";

async function main() {
  const providerArg = process.argv[2] || "gmail";
  const mode = process.argv[3] || "realtime";

  console.log(`Email Triage Engine`);
  console.log(`Provider: ${providerArg}`);
  console.log(`Mode: ${mode}`);
  console.log("---");

  let provider: EmailProvider;

  switch (providerArg) {
    case "gmail":
      provider = new GmailProvider();
      break;
    case "outlook":
      provider = new OutlookProvider();
      break;
    default:
      console.error(`Unknown provider: ${providerArg}. Use "gmail" or "outlook".`);
      process.exit(1);
  }

  await provider.authenticate();

  switch (mode) {
    case "realtime":
      await startRealtimeMode(provider);
      break;
    case "bulk":
      const { default: runBulk } = await import("./modes/bulk.js");
      break;
    default:
      console.error(`Unknown mode: ${mode}. Use "realtime" or "bulk".`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
