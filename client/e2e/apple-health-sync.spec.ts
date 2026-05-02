/**
 * E2E tests for fitness sync UI (Apple Health token + OAuth providers UI).
 *
 * Seed data required (provided by server/src/seed.ts):
 *   user1@stepsprint.local / password123 — participant enrolled in the demo challenge.
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
  await expect(page.getByRole("heading", { name: /Your Dashboard|Participant Home/i })).toBeVisible({
    timeout: 15_000,
  });
}

async function navigateToIntegrations(page: Page): Promise<void> {
  await page.getByTestId("tab-devices").click();
  await expect(page.getByRole("heading", { name: /Fitness sync/i })).toBeVisible();
}

test.describe("Fitness sync (Devices)", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("Devices tab is visible after login", async ({ page }) => {
    await loginAsParticipant(page);
    await expect(page.getByTestId("tab-devices")).toBeVisible();
  });

  test("Fitness sync panel shows Apple section on Devices tab", async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToIntegrations(page);

    await expect(page.getByRole("heading", { name: /Apple Watch \/ Apple Health/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Generate new token/i })).toBeVisible();
  });

  test("generate a new token and see it revealed once", async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToIntegrations(page);

    await page.getByRole("button", { name: /Generate new token/i }).click();

    await expect(page.getByText(/Token created\. Copy it now/i)).toBeVisible({ timeout: 10_000 });
    const tokenEl = page.locator("code.token-value");
    await expect(tokenEl).toBeVisible();

    const tokenText = await tokenEl.textContent();
    expect(tokenText).toMatch(/^ssp_[0-9a-f]{64}$/);

    await expect(page.getByRole("button", { name: /Copy token/i })).toBeVisible();
  });

  test("generated token appears in the token list", async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToIntegrations(page);

    await page.getByRole("button", { name: /Generate new token/i }).click();
    await expect(page.getByText(/Token created/i)).toBeVisible({ timeout: 10_000 });

    await expect(page.locator(".token-label").filter({ hasText: /Apple Watch Sync/i }).first()).toBeVisible();
  });

  test("reveals iOS Shortcut setup instructions", async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToIntegrations(page);

    await page.getByRole("button", { name: /Generate new token/i }).click();
    await expect(page.getByText(/Token created/i)).toBeVisible({ timeout: 10_000 });

    await page.getByText(/iOS Shortcut setup instructions/i).click();

    await expect(page.getByText(/Shortcuts/i)).toBeVisible();
    await expect(page.getByText(/Get Contents of URL/i)).toBeVisible();
    await expect(page.getByText(/Authorization: Bearer/i)).toBeVisible();
  });

  test("revoke a token removes it from the list", async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToIntegrations(page);

    await page.getByRole("button", { name: /Generate new token/i }).click();
    await expect(page.getByText(/Token created/i)).toBeVisible({ timeout: 10_000 });

    const tokenRows = page.locator(".token-row");
    const countBefore = await tokenRows.count();
    expect(countBefore).toBeGreaterThan(0);

    await page.getByRole("button", { name: /Revoke/i }).first().click();

    await expect(tokenRows).toHaveCount(countBefore - 1, { timeout: 10_000 });
  });

  test("OAuth provider section hidden when Fitbit, Google Fit, and Garmin are not configured", async ({
    page,
  }) => {
    await loginAsParticipant(page);
    await navigateToIntegrations(page);

    await expect(page.getByRole("heading", { name: /Apple Watch \/ Apple Health/i })).toBeVisible();

    await expect(page.getByRole("heading", { name: /OAuth services/i })).not.toBeVisible();
  });
});
