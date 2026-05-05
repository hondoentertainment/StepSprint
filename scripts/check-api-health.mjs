#!/usr/bin/env node
/**
 * Smoke-check a deployed StepSprint API (health + CORS reflection).
 * Usage: node scripts/check-api-health.mjs [API_BASE_URL]
 *   API_BASE_URL defaults to https://stepsprint-api.onrender.com
 * Env: API_BASE_URL overrides default
 */
const base = (
  process.argv[2] ||
  process.env.API_BASE_URL ||
  "https://stepsprint-api.onrender.com"
).replace(/\/$/, "");

const healthUrl = `${base}/api/health`;
const origin = process.env.CORS_TEST_ORIGIN || "https://step-sprint.vercel.app";

async function main() {
  const res = await fetch(healthUrl, {
    headers: { Origin: origin },
  });
  const body = await res.text();
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    json = body;
  }
  console.log("GET", healthUrl);
  console.log("Status:", res.status);
  console.log("Body:", json);
  const aco = res.headers.get("access-control-allow-origin");
  console.log("Access-Control-Allow-Origin:", aco ?? "(missing — non-CORS response ok for simple GET)");
  if (res.status === 404) {
    console.error(
      "\nA 404 from Render often means no web service is bound to this URL (dashboard: x-render-routing: no-server). Deploy the API from render.yaml or fix the hostname."
    );
    process.exitCode = 1;
    return;
  }
  if (typeof json === "object" && json && "transactionalEmail" in json) {
    console.log("Transactional email (prod):", json.transactionalEmail);
  }
  if (!res.ok) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
