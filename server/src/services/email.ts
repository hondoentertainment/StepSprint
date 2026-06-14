import { config } from "../config";
import { logger } from "../logger";

interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Outcome of `sendEmail`: useful for tests, audit trails, and retry decisions. */
export type SendEmailResult =
  | { transport: "resend"; id: string }
  | { transport: "smtp"; messageId: string | undefined }
  | { transport: "log"; reason: "no_transport_configured" };

// ---------------------------------------------------------------------------
// Nodemailer singleton — created once per process if raw SMTP is configured.
// ---------------------------------------------------------------------------
type Transporter = import("nodemailer").Transporter;
let _smtpTransporter: Transporter | null = null;

async function getSmtpTransporter(): Promise<Transporter> {
  if (_smtpTransporter) return _smtpTransporter;
  const nodemailer = await import("nodemailer");
  _smtpTransporter = nodemailer.createTransport({
    host: config.smtp!.host,
    port: config.smtp!.port,
    auth: config.smtp!.user
      ? { user: config.smtp!.user, pass: config.smtp!.pass }
      : undefined,
  });
  return _smtpTransporter;
}

// Exposed for tests; resets the cached transporter so each test can re-stub.
export function _resetEmailTransporterForTests(): void {
  _smtpTransporter = null;
}

// ---------------------------------------------------------------------------
// Public send function
// Priority: Resend HTTP API → raw SMTP → dev-mode log
// ---------------------------------------------------------------------------
export async function sendEmail(payload: EmailPayload): Promise<SendEmailResult> {
  if (config.resendApiKey) {
    return sendViaResend(payload);
  }

  if (config.smtp) {
    return sendViaSmtp(payload);
  }

  logger.info(
    { to: payload.to, subject: payload.subject, body: payload.text },
    "EMAIL (dev mode — configure RESEND_API_KEY or SMTP vars to send real emails)"
  );
  return { transport: "log", reason: "no_transport_configured" };
}

/**
 * Send via Resend's HTTP API.
 *
 * We deliberately use HTTP instead of Resend's SMTP bridge because Vercel
 * Functions have intermittent issues with outbound port 465/587 and the HTTP
 * path gives us structured error codes (rate-limited, invalid sender domain,
 * etc.) that are easier to surface in logs and Sentry.
 */
async function sendViaResend(payload: EmailPayload): Promise<SendEmailResult> {
  const body: Record<string, unknown> = {
    from: config.emailFrom,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
  };
  if (payload.html) body.html = payload.html;

  // Cap individual sends so a stalled Resend response doesn't block the
  // serverless function indefinitely.
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 10_000);

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    const reason =
      err instanceof DOMException && err.name === "AbortError"
        ? "timeout after 10s"
        : err instanceof Error
          ? err.message
          : String(err);
    throw new Error(`Resend request failed: ${reason}`);
  }
  clearTimeout(timeout);

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    let detail = text.slice(0, 500);
    try {
      const parsed = JSON.parse(text) as { message?: string; name?: string };
      if (parsed.message) detail = parsed.message;
      if (parsed.name && !detail.includes(parsed.name)) {
        detail = `${parsed.name}: ${detail}`;
      }
    } catch {
      /* leave `detail` as raw text snippet */
    }
    throw new Error(`Resend API ${res.status}: ${detail || res.statusText}`);
  }

  let id = "";
  try {
    const parsed = JSON.parse(text) as { id?: unknown };
    if (typeof parsed.id === "string") id = parsed.id;
  } catch {
    /* Resend always returns JSON on 2xx; if it didn't, treat as success with empty id */
  }
  return { transport: "resend", id };
}

async function sendViaSmtp(payload: EmailPayload): Promise<SendEmailResult> {
  const transporter = await getSmtpTransporter();
  const info = await transporter.sendMail({
    from: config.smtp!.from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });
  const messageId =
    (info as { messageId?: unknown } | null | undefined)?.messageId &&
    typeof (info as { messageId?: unknown }).messageId === "string"
      ? ((info as { messageId: string }).messageId)
      : undefined;
  return { transport: "smtp", messageId };
}
