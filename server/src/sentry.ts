import * as Sentry from "@sentry/node";
import { config } from "./config";

let initialized = false;

/**
 * Initialize Sentry for production observability.
 *
 * Must be called BEFORE importing the Express app (or any instrumented
 * modules) per Sentry v8+ auto-instrumentation requirements.
 *
 * No-ops silently when SENTRY_DSN is unset so local/dev does not need
 * Sentry configured.
 */
export function initSentry(): void {
  if (initialized) return;
  const dsn = config.sentryDsn;
  if (!dsn) return;

  const env = config.nodeEnv;
  const isProduction = env === "production";

  Sentry.init({
    dsn,
    environment: env,
    tracesSampleRate: isProduction ? 0.1 : 1.0,
  });

  initialized = true;
}

export { Sentry };
