/** Normalize email for storage and lookups (case-insensitive identity). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
