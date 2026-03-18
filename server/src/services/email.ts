import { config } from "../config";

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
    console.log("=== EMAIL (dev mode — no SMTP configured) ===");
    console.log(`To: ${payload.to}`);
    console.log(`Subject: ${payload.subject}`);
    console.log(payload.text);
    console.log("=== END EMAIL ===");
  }
}
