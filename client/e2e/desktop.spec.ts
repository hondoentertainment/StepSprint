import { test, expect } from "@playwright/test";

test.describe("Desktop viewport", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("login page renders", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Schafer Shufflers/i })).toBeVisible();
  });

  test("full login and navigation flow", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(/email/i).fill("user1@stepsprint.local");
    await page.getByRole("button", { name: /get started/i }).click();
    await expect(page.getByRole("heading", { name: /Participant Home/i })).toBeVisible({ timeout: 15000 });
    await page.getByTestId("tab-submit").click();
    await expect(page.getByRole("heading", { name: /Submit steps/i })).toBeVisible();
    await page.getByTestId("tab-weekly-top-steppers").click();
    await expect(page.getByRole("heading", { name: /Weekly Top Steppers/i })).toBeVisible();
    await page.getByTestId("tab-team-standings").click();
    await expect(page.getByRole("heading", { name: /Team/i })).toBeVisible();
  });

  test("logout returns to login", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(/email/i).fill("user1@stepsprint.local");
    await page.getByRole("button", { name: /get started/i }).click();
    await expect(page.getByRole("heading", { name: /Participant Home/i })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: /log out/i }).click();
    await expect(page.getByRole("heading", { name: /Schafer Shufflers/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });
});
