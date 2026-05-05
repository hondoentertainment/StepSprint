#!/usr/bin/env node
/**
 * Smoke-check a deployed StepSprint API: health, CORS, release, email.
 *
 * Usage:
 *   node scripts/check-api-health.mjs [API_BASE_URL] [--strict]
 *
 * Defaults:
 *   API_BASE_URL = process.env.API_BASE_URL  (no built-in default — pass your Vercel host)
 *   CORS_TEST_ORIGIN = process.env.CORS_TEST_ORIGIN || same as API_BASE_URL
 *
 * Examples:
 *   npm run check:api -- https://stepsprint.vercel.app
 *   npm run check:api -- https://stepsprint.vercel.app --strict
 *
 * --strict (or STRICT=true): also fail (exit 1) when production signals
 *   are missing/weak — useful as a launch / pre-cutover gate:
 *     - body.release missing            (no Sentry release tracking)
 *     - body.transactionalEmail !== "configured"
 *                                       (Resend/SMTP not wired or escape hatch on)
 *     - access-control-allow-origin missing for the test Origin
 *                                       (CORS will block the SPA)
 */
const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const flags = new Set(args.filter((a) => a.startsWith("--")));
const strict = flags.has("--strict") || process.env.STRICT === "true";

const baseRaw = positional[0] || process.env.API_BASE_URL;
if (!baseRaw) {
  console.error(
    "Usage: node scripts/check-api-health.mjs <api-base-url> [--strict]\n" +
      "       npm run check:api -- https://your-app.vercel.app\n" +
      "Tip: API_BASE_URL also works as an env var."
  );
  process.exit(2);
}
const base = baseRaw.replace(/\/$/, "");

const healthUrl = `${base}/api/health`;
// On a single-Vercel deploy the SPA and API share an origin, so the test
// origin defaults to the API host. Override with CORS_TEST_ORIGIN when
// validating a custom-domain SPA against the same API.
const origin = process.env.CORS_TEST_ORIGIN || base;

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

async function main() {
  const started = Date.now();
  let res;
  try {
    res = await fetch(healthUrl, { headers: { Origin: origin } });
  } catch (err) {
    fail(`Network error reaching ${healthUrl}: ${err.message}`);
    return;
  }
  const elapsedMs = Date.now() - started;
  const body = await res.text();
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    json = body;
  }

  console.log("GET", healthUrl);
  console.log(`Status: ${res.status} (${elapsedMs} ms)`);
  console.log("Body:", json);
  const aco = res.headers.get("access-control-allow-origin");
  console.log(
    `Access-Control-Allow-Origin (Origin=${origin}): ${aco ?? "(missing)"}`
  );

  if (res.status === 404) {
    fail(
      "404 from the API base. On Vercel this means the project has no Function bound to /api/* — " +
        "either the deploy hasn't happened yet, vercel.json's `functions` entry is missing/wrong, or " +
        "`api/[...all].js` failed to bundle (check the Functions tab and Deployments → Build Logs)."
    );
    return;
  }
  if (!res.ok) {
    fail(`Health check returned non-2xx (${res.status}).`);
    return;
  }
  if (typeof json !== "object" || json === null) {
    fail("Health body was not JSON — check that you hit the API, not the SPA fallback.");
    return;
  }

  const release = typeof json.release === "string" ? json.release : null;
  const transactionalEmail =
    typeof json.transactionalEmail === "string" ? json.transactionalEmail : null;
  const dbStatus = typeof json.db === "string" ? json.db : null;

  console.log(`Release: ${release ?? "(unset)"}`);
  console.log(
    `Transactional email: ${transactionalEmail ?? "(non-prod, not reported)"}`
  );

  if (dbStatus !== "up") {
    fail(`db status is "${dbStatus ?? "unknown"}" — Postgres unreachable.`);
  }

  if (strict) {
    if (!release) {
      fail(
        "release missing. Set SENTRY_RELEASE on the API (or rely on RENDER_GIT_COMMIT/GITHUB_SHA being injected) so Sentry events can be grouped by build."
      );
    }
    if (transactionalEmail === null) {
      fail(
        "transactionalEmail not present in body — API is not running with NODE_ENV=production."
      );
    } else if (transactionalEmail !== "configured") {
      fail(
        `transactionalEmail is "${transactionalEmail}". Public launches require RESEND_API_KEY (or SMTP_HOST) + SMTP_FROM; remove ALLOW_PRODUCTION_WITHOUT_EMAIL.`
      );
    }
    if (!aco) {
      fail(
        `CORS did not echo Access-Control-Allow-Origin for ${origin}. Set APP_ORIGIN (and APP_ORIGIN_ALLOWLIST if needed) on the API to match the SPA URL exactly.`
      );
    }
  }

  if (process.exitCode !== 1) {
    console.log(strict ? "OK (strict)" : "OK");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
