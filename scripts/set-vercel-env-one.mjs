#!/usr/bin/env node
/**
 * One-off helper to push a single env var to Vercel without trailing newlines.
 * Reads name/value/sensitive flag from argv. Mirrors the spawn pattern in
 * scripts/set-vercel-env.mjs without the JSON-secrets-file requirement, so we
 * can push values that arrive ad hoc (e.g. operator pasted a Resend key).
 *
 * Usage:
 *   node scripts/set-vercel-env-one.mjs NAME "value" [--sensitive]
 */
import { spawn } from "node:child_process";

const [, , name, value, ...flags] = process.argv;
if (!name || value === undefined) {
  console.error("Usage: set-vercel-env-one.mjs NAME value [--sensitive]");
  process.exit(2);
}
const sensitive = flags.includes("--sensitive");

const args = ["vercel", "env", "add", name, "production", "--force", "-y"];
if (sensitive) args.push("--sensitive");

const child = spawn("npx", args, {
  stdio: ["pipe", "inherit", "inherit"],
  shell: process.platform === "win32",
});
child.stdin.write(value);
child.stdin.end();
child.on("close", (code) => process.exit(code ?? 1));
