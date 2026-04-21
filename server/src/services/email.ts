import { config } from "../config";
import { logger } from "../logger";

interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  if (config.smtp) {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      auth: config.smtp.user
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined,
    });
    await transporter.sendMail({
      from: config.smtp.from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
  } else {
    logger.info(
      {
        to: payload.to,
        subject: payload.subject,
        body: payload.text,
      },
      "EMAIL (dev mode — no SMTP configured)"
    );
  }
}
