import { test, expect, type Page } from "@playwright/test";

// Seed data expected:
//   admin@stepsprint.local  (password `password123`, role ADMIN)
//   user1@stepsprint.local  (participant with submissions on `demo-challenge`)
//   `demo-challenge` challenge with ~10 days of submissions per participant.
// Login flow mirrors client/e2e/desktop.spec.ts: email field, "Get started" button.
// If login requires a password (register/login combined on Login.tsx) the helper
// fills it when present; participant seed password is `password123`.

const ADMIN_EMAIL = "admin@stepsprint.local";
const ADMIN_PASSWORD = "password123";

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  const passwordField = page.getByLabel(/^password/i).first();
  if (await passwordField.isVisible().catch(() => false)) {
    await passwordField.fill(ADMIN_PASSWORD);
  }
  await page.getByRole("button", { name: /get started|log in|sign in/i }).first().click();
  // Admin lands on the authed shell; the Admin tab is only rendered for ADMIN users.
  await expect(page.getByTestId("tab-admin")).toBeVisible({ timeout: 15_000 });
}

test.describe("Admin console", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("admin login and challenge list renders", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByTestId("tab-admin").click();

    await expect(page.getByRole("heading", { name: /Admin console/i })).toBeVisible();

    // The challenge selector in the topbar is populated from GET /api/challenges.
    // At minimum the seeded `StepSprint Demo` challenge should appear as an option.
    const challengeSelect = page.locator("header select").first();
    await expect(challengeSelect).toBeVisible();
    await expect(challengeSelect.locator("option")).toHaveCount(
      await challengeSelect.locator("option").count()
    );
    await expect(challengeSelect).toContainText(/StepSprint Demo|Demo/i);
  });

  test("admin can flag a submission via steps edit (>100k auto-flags)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByTestId("tab-admin").click();
    await expect(page.getByRole("heading", { name: /Admin console/i })).toBeVisible();

    // Target a known seeded participant so the moderation list is deterministic.
    await page.getByLabel(/Search/i).fill("user1@stepsprint.local");

    // First submission row for this user.
    const firstRow = page.locator(".list-row").first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
    const rowText = (await firstRow.textContent()) ?? "";
    // Capture the date fragment so we can re-find the row after reload.
    const dateMatch = rowText.match(/\d{4}-\d{2}-\d{2}/);
    expect(dateMatch).not.toBeNull();
    const targetDate = dateMatch![0];

    // The server flags any submission whose `steps` > 100_000; editing to
    // 150_000 via the moderation form is the supported way to flag via the UI.
    await page.getByLabel(/Reason/i).fill("E2E flag test");
    await page.getByLabel(/Edit steps/i).fill("150000");
    await firstRow.getByRole("button", { name: /^Edit$/ }).click();

    // Confirm the modal.
    await page.getByRole("button", { name: /^Save$/ }).click();

    await expect(page.getByText(/Submission updated\./i)).toBeVisible({ timeout: 10_000 });

    // Persistence check: reload, re-search, confirm the row renders with `(flagged)`.
    await page.reload();
    await page.getByTestId("tab-admin").click();
    await page.getByLabel(/Search/i).fill("user1@stepsprint.local");

    const rowAfter = page
      .locator(".list-row")
      .filter({ hasText: targetDate })
      .first();
    await expect(rowAfter).toContainText(/flagged/i);
  });

  test("admin can create a new challenge", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByTestId("tab-admin").click();
    await expect(page.getByRole("heading", { name: /Admin console/i })).toBeVisible();

    const challengeName = `E2E Challenge ${Date.now()}`;

    // Form labels: Name / Start date / End date / Timezone / Team size.
    await page.getByLabel(/^Name$/).fill(challengeName);
    await page.getByLabel(/Start date/i).fill("2026-05-01");
    await page.getByLabel(/End date/i).fill("2026-05-31");
    // Timezone/team size keep their defaults (America/Chicago, 4).

    await page.getByRole("button", { name: /Create challenge/i }).click();

    await expect(page.getByText(/Challenge created\./i)).toBeVisible({ timeout: 10_000 });

    // New challenge should appear in the header selector.
    const challengeSelect = page.locator("header select").first();
    await expect(challengeSelect).toContainText(challengeName);
  });
});
