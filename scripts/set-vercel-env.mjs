#!/usr/bin/env node
/**
 * One-shot helper to push production env vars to Vercel without trailing newlines.
 *
 * Usage: node scripts/set-vercel-env.mjs
 *
 * Reads secrets from local tmp files (.secrets-launch.tmp.json, .vapid-launch.tmp.json)
 * which should be deleted after a successful run. Designed for the launch runbook in
 * docs/LAUNCH.md.
 */
import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

function spawnWithStdin(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`exit ${code}\n${stderr}\n${stdout}`));
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}

async function setEnv(name, value, { sensitive = false } = {}) {
  const args = ["vercel", "env", "add", name, "production", "--force", "-y"];
  if (sensitive) args.push("--sensitive");
  process.stdout.write(`  ${name} ... `);
  try {
    await spawnWithStdin("npx", args, value);
    process.stdout.write("ok\n");
  } catch (err) {
    process.stdout.write("FAILED\n");
    throw err;
  }
}

async function main() {
  const secretsPath = ".secrets-launch.tmp.json";
  const vapidPath = ".vapid-launch.tmp.json";
  if (!existsSync(secretsPath)) throw new Error(`missing ${secretsPath}`);
  if (!existsSync(vapidPath)) throw new Error(`missing ${vapidPath}`);
  const secrets = JSON.parse(readFileSync(secretsPath, "utf8"));
  const vapid = JSON.parse(readFileSync(vapidPath, "utf8"));

  const items = [
    ["JWT_SECRET", secrets.JWT_SECRET, { sensitive: true }],
    ["CRON_SECRET", secrets.CRON_SECRET, { sensitive: true }],
    ["ADMIN_PASSWORD", secrets.ADMIN_PASSWORD, { sensitive: true }],
    ["APP_ORIGIN", "https://stepsprint.vercel.app"],
    ["ALLOW_PRODUCTION_WITHOUT_EMAIL", "true"],
    ["REMINDER_USE_EXTERNAL_CRON", "true"],
    ["VAPID_PUBLIC_KEY", vapid.publicKey],
    ["VAPID_PRIVATE_KEY", vapid.privateKey, { sensitive: true }],
    ["VAPID_SUBJECT", "mailto:admin@stepsprint.app"],
  ];

  console.log(`Pushing ${items.length} production env vars to Vercel:`);
  for (const [name, value, opts = {}] of items) {
    if (!value) {
      console.log(`  ${name} ... SKIPPED (empty value)`);
      continue;
    }
    await setEnv(name, value, opts);
  }
  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
