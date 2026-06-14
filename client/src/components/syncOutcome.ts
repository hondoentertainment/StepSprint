/**
 * Pick the right localized message for an OAuth sync result. The server
 * returns `{ imported, updated, skipped }` where:
 *   - `imported` = days newly written
 *   - `updated`  = days where we overwrote an existing submission
 *   - `skipped`  = days the provider returned that were outside the challenge
 *                   window (filtered out before write)
 *
 * The shape `{ 0, 0, 0 }` means the provider returned no data for the range.
 * `{ 0, 0, >0 }` means data came back but every day was outside the
 * challenge window (a common cause of confused-looking "0 imported" results).
 */
export function formatSyncOutcome(
  t: (key: string, opts?: Record<string, unknown>) => string,
  name: string,
  outcome: { imported: number; updated: number; skipped: number },
  rangeDays: number | null,
): string {
  const { imported, updated, skipped } = outcome;
  if (imported === 0 && updated === 0 && skipped === 0) {
    return t("integrations.syncResultNoData", { name });
  }
  if (imported === 0 && updated === 0 && skipped > 0) {
    return t("integrations.syncResultOutOfWindow", { name, skipped });
  }
  if (imported === 0 && updated > 0) {
    return t("integrations.syncResultUpToDate", { name, updated, skipped });
  }
  if (rangeDays !== null && rangeDays > 1) {
    return t("integrations.syncResultRange", {
      name,
      days: rangeDays,
      imported,
      updated,
      skipped,
    });
  }
  return t("integrations.syncResult", { name, imported, updated, skipped });
}
