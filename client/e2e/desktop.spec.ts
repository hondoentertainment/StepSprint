import { test, expect } from "@playwright/test";

test.describe("Desktop viewport", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("login page renders", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /StepSprint/i })).toBeVisible();
  });

  test("full login and navigation flow", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(/email/i).fill("user1@stepsprint.local");
    await page.getByRole("button", { name: /get started/i }).click();
    await expect(page.getByRole("heading", { name: /Your Dashboard/i })).toBeVisible({ timeout: 15000 });
    await page.getByTestId("tab-submit").click();
    await expect(page.getByRole("heading", { name: /Submit steps/i })).toBeVisible();
    await page.getByTestId("tab-leaderboard").click();
    await expect(page.getByRole("heading", { name: /Weekly Leaderboard/i })).toBeVisible();
    await page.getByTestId("tab-teams").click();
    await expect(page.getByRole("heading", { name: /Team/i })).toBeVisible();
  });

  test("logout returns to login", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(/email/i).fill("user1@stepsprint.local");
    await page.getByRole("button", { name: /get started/i }).click();
    await expect(page.getByRole("heading", { name: /Your Dashboard/i })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: /log out/i }).click();
    await expect(page.getByRole("heading", { name: /StepSprint/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });
});
