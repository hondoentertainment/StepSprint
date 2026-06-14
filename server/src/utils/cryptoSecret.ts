import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { config } from "../config";

const ALG = "aes-256-gcm";
const SALT = "stepsprint-fitness-token-v1";

function key(): Buffer {
  return scryptSync(config.jwtSecret, SALT, 32);
}

/** Seal a string for storage (OAuth tokens). */
export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function openSecret(sealed: string): string {
  const buf = Buffer.from(sealed, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv(ALG, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
