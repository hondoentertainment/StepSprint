import * as Sentry from "@sentry/react";
import { getLastApiRequestId } from "./requestContext";

let initialized = false;

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
  });

  initialized = true;
}

export function isSentryInitialized(): boolean {
  return initialized;
}

export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!initialized) return;
  const lastRequestId = getLastApiRequestId();
  const extra = {
    ...(lastRequestId ? { lastRequestId } : {}),
    ...context,
  };
  Sentry.captureException(error, Object.keys(extra).length > 0 ? { extra } : undefined);
}
