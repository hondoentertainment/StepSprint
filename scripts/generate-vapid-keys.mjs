#!/usr/bin/env node
/**
 * Generate VAPID keys for Web Push notifications and print Vercel setup instructions.
 *
 * Usage:
 *   node scripts/generate-vapid-keys.mjs
 *   npm run generate:vapid
 *
 * The keys are printed to stdout only — they are NOT written to any file.
 * Copy them into Vercel: project → Settings → Environment Variables (Production scope).
 */

import { createRequire } from "module";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
// web-push lives in server/node_modules (or root node_modules via hoisting)
const rootRequire = createRequire(resolve(__dirname, "../package.json"));

let webpush;
try {
  webpush = rootRequire("web-push");
} catch {
  // fall back to server workspace
  try {
    const serverRequire = createRequire(
      resolve(__dirname, "../server/node_modules/web-push/package.json")
    );
    webpush = serverRequire("web-push");
  } catch {
    console.error(
      "web-push not found. Run: npm ci && cd server && npm ci\nThen retry from the repo root."
    );
    process.exit(1);
  }
}

const keys = webpush.generateVAPIDKeys();

const subject =
  process.env.VAPID_SUBJECT ||
  process.env.SMTP_FROM?.match(/<(.+)>/)?.[1] ||
  "mailto:admin@example.com";

console.log("\nVAPID keys generated successfully.\n");
console.log("─".repeat(60));
console.log("Add these to Vercel → project → Settings → Environment Variables");
console.log("(Production scope — keep VAPID_PRIVATE_KEY secret):\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=${subject}`);
console.log("─".repeat(60));
console.log(`
Notes:
  • VAPID_SUBJECT must be a mailto: or https: URI identifying the push sender.
    Update the placeholder above with your real contact address.
  • After setting these in Vercel and redeploying, Web Push is enabled.
    Participants can subscribe from the Devices page in the app.
  • The public key is sent to browsers — the private key must stay server-side.
  • Re-generating keys invalidates all existing push subscriptions. Only run
    this script once per deployment environment.
`);
