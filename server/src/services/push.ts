import webpush, { PushSubscription, SendResult } from "web-push";
import { config } from "../config";
import { logger } from "../logger";

let initialized = false;
let enabled = false;

/**
 * Configure web-push with VAPID credentials from config. Safe to call more
 * than once; only the first call has any effect. When any of the VAPID
 * config values is missing, push remains disabled and all helpers become
 * no-ops. Logs once at startup so operators can tell from the logs whether
 * push was wired up.
 */
export function initPush(): void {
  if (initialized) return;
  initialized = true;

  const { publicKey, privateKey, subject } = config.vapid;
  if (!publicKey || !privateKey || !subject) {
    enabled = false;
    logger.info(
      { vapidConfigured: false },
      "Web push disabled (VAPID keys not configured)"
    );
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  enabled = true;
  logger.info({ vapidConfigured: true }, "Web push enabled");
}

/** True once `initPush()` has run and all VAPID env vars were set. */
export function isPushEnabled(): boolean {
  return enabled;
}

/**
 * Send a push notification to a single subscription. When push is not
 * enabled the call resolves to `null` without contacting any server.
 * Callers that care about permanent failures (410 / 404) can inspect
 * `result.statusCode` and delete the subscription row.
 */
export async function sendPush(
  subscription: PushSubscription,
  payload: unknown
): Promise<SendResult | null> {
  if (!enabled) return null;
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return webpush.sendNotification(subscription, body);
}
