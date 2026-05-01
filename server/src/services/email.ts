import { config } from "../config";
import { logger } from "../logger";

interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

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

// ---------------------------------------------------------------------------
// Public send function
// Priority: Resend API → raw SMTP → dev-mode log
// ---------------------------------------------------------------------------
export async function sendEmail(payload: EmailPayload): Promise<void> {
  if (config.resendApiKey) {
    await sendViaResend(payload);
    return;
  }

  if (config.smtp) {
    await sendViaSmtp(payload);
    return;
  }

  logger.info(
    { to: payload.to, subject: payload.subject, body: payload.text },
    "EMAIL (dev mode — configure RESEND_API_KEY or SMTP vars to send real emails)"
  );
}

async function sendViaResend(payload: EmailPayload): Promise<void> {
  // Use Resend's SMTP bridge so we don't need a separate SDK dependency.
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: "smtp.resend.com",
    port: 465,
    secure: true,
    auth: { user: "resend", pass: config.resendApiKey },
  });
  await transporter.sendMail({
    from: config.emailFrom,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });
}

async function sendViaSmtp(payload: EmailPayload): Promise<void> {
  const transporter = await getSmtpTransporter();
  await transporter.sendMail({
    from: config.smtp!.from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });
}
