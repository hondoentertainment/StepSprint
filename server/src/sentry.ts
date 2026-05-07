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
  const isServerless = Boolean(process.env.VERCEL);

  Sentry.init({
    dsn,
    environment: env,
    tracesSampleRate: isProduction ? 0.1 : 1.0,
    release: config.deploymentRelease,
    // On Vercel Functions the process can be frozen as soon as the response
    // is sent. Shorten the default 2s flush window so the SDK gives up
    // gracefully on slow networks rather than blocking the lambda exit.
    ...(isServerless ? { shutdownTimeout: 1500 } : {}),
    // Strip any Authorization / cookie headers that may have leaked into
    // breadcrumbs. The pino-http logger already redacts these on the request
    // log, but Sentry's HTTP integration captures them separately.
    beforeBreadcrumb(breadcrumb) {
      const data = breadcrumb.data as Record<string, unknown> | undefined;
      if (data && typeof data === "object") {
        for (const key of Object.keys(data)) {
          if (/authorization|cookie|x-csrf-token|set-cookie/i.test(key)) {
            data[key] = "[Filtered]";
          }
        }
      }
      return breadcrumb;
    },
  });

  initialized = true;
}

/**
 * Flush queued Sentry events. On Vercel Functions, call this in long-running
 * background tasks (e.g. the reminder cron) before returning so anything
 * captured in the handler reaches the wire.
 */
export async function flushSentry(timeoutMs = 1500): Promise<void> {
  if (!initialized) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    /* never let a flush error fail the original request */
  }
}

export { Sentry };
