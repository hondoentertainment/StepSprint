import * as Sentry from "@sentry/react";

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
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
