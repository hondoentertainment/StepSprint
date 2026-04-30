/**
 * E2E tests for the Apple Watch / Health sync UI.
 *
 * Seed data required (provided by server/src/seed.ts):
 *   user1@stepsprint.local / password123 — participant enrolled in the demo challenge.
 *
 * The tests exercise the full browser interaction: toggling the sync panel,
 * generating a token, verifying it appears in the list, and revoking it.
 */
import { test, expect, type Page } from "@playwright/test";

const USER_EMAIL = "user1@stepsprint.local";
const USER_PASSWORD = "password123";

async function loginAsParticipant(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel(/email/i).fill(USER_EMAIL);
  const passwordField = page.getByLabel(/^password/i).first();
  if (await passwordField.isVisible().catch(() => false)) {
    await passwordField.fill(USER_PASSWORD);
  }
  await page.getByRole("button", { name: /get started|log in|sign in/i }).first().click();
  await expect(page.getByRole("heading", { name: /Your Dashboard/i })).toBeVisible({
    timeout: 15_000,
  });
}

async function navigateToSubmit(page: Page): Promise<void> {
  await page.getByTestId("tab-submit").click();
  await expect(page.getByRole("heading", { name: /Submit steps/i })).toBeVisible();
}

test.describe("Apple Watch sync UI", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("sync toggle is visible on the submit tab", async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToSubmit(page);

    await expect(page.getByRole("button", { name: /Sync from Apple Watch/i })).toBeVisible();
  });

  test("toggle opens and closes the Apple Health sync panel", async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToSubmit(page);

    const toggleBtn = page.getByRole("button", { name: /Sync from Apple Watch/i });

    // Panel is hidden initially
    await expect(page.getByRole("heading", { name: /Apple Watch \/ Apple Health sync/i })).not.toBeVisible();

    // Open panel
    await toggleBtn.click();
    await expect(page.getByRole("heading", { name: /Apple Watch \/ Apple Health sync/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Generate new token/i })).toBeVisible();

    // Toggle closed
    await page.getByRole("button", { name: /Hide Apple Watch sync/i }).click();
    await expect(page.getByRole("heading", { name: /Apple Watch \/ Apple Health sync/i })).not.toBeVisible();
  });

  test("generate a new token and see it revealed once", async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToSubmit(page);

    await page.getByRole("button", { name: /Sync from Apple Watch/i }).click();
    await expect(page.getByRole("heading", { name: /Apple Watch \/ Apple Health sync/i })).toBeVisible();

    await page.getByRole("button", { name: /Generate new token/i }).click();

    // Success banner + token value appear
    await expect(page.getByText(/Token created\. Copy it now/i)).toBeVisible({ timeout: 10_000 });
    const tokenEl = page.locator("code.token-value");
    await expect(tokenEl).toBeVisible();

    // Token has the expected prefix
    const tokenText = await tokenEl.textContent();
    expect(tokenText).toMatch(/^ssp_[0-9a-f]{64}$/);

    // "Copy token" button is visible
    await expect(page.getByRole("button", { name: /Copy token/i })).toBeVisible();
  });

  test("generated token appears in the token list", async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToSubmit(page);

    await page.getByRole("button", { name: /Sync from Apple Watch/i }).click();
    await page.getByRole("button", { name: /Generate new token/i }).click();
    await expect(page.getByText(/Token created/i)).toBeVisible({ timeout: 10_000 });

    // The token list should contain at least one entry with the default label
    await expect(page.locator(".token-label").filter({ hasText: /Apple Watch Sync/i }).first()).toBeVisible();
  });

  test("reveals iOS Shortcut setup instructions", async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToSubmit(page);

    await page.getByRole("button", { name: /Sync from Apple Watch/i }).click();
    await page.getByRole("button", { name: /Generate new token/i }).click();
    await expect(page.getByText(/Token created/i)).toBeVisible({ timeout: 10_000 });

    // Expand the guide
    const detailsSummary = page.getByText(/iOS Shortcut setup instructions/i);
    await detailsSummary.click();

    // Key instruction steps are visible
    await expect(page.getByText(/Get Health Sample/i)).toBeVisible();
    await expect(page.getByText(/Get Contents of URL/i)).toBeVisible();
    await expect(page.getByText(/Authorization: Bearer/i)).toBeVisible();
  });

  test("revoke a token removes it from the list", async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToSubmit(page);

    await page.getByRole("button", { name: /Sync from Apple Watch/i }).click();
    await page.getByRole("button", { name: /Generate new token/i }).click();
    await expect(page.getByText(/Token created/i)).toBeVisible({ timeout: 10_000 });

    // Count tokens before revoke
    const tokenRows = page.locator(".token-row");
    const countBefore = await tokenRows.count();
    expect(countBefore).toBeGreaterThan(0);

    // Revoke the first token
    const firstRevoke = page.getByRole("button", { name: /Revoke/i }).first();
    await firstRevoke.click();

    // After revoke the count decreases
    await expect(tokenRows).toHaveCount(countBefore - 1, { timeout: 10_000 });
  });

  test("OAuth section shows Fitbit and Google Fit connection status", async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToSubmit(page);

    await page.getByRole("button", { name: /Sync from Apple Watch/i }).click();
    await expect(page.getByRole("heading", { name: /Apple Watch \/ Apple Health sync/i })).toBeVisible();

    // OAuth provider cards should be visible
    await expect(page.getByText(/Fitbit/i).first()).toBeVisible();
    await expect(page.getByText(/Google Fit/i).first()).toBeVisible();
  });
});
