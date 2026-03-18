import crypto from "crypto";
import bcrypt from "bcryptjs";

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function hashResetToken(token: string): Promise<string> {
  return bcrypt.hash(token, 6);
}

export async function verifyResetToken(
  token: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(token, hash);
}
