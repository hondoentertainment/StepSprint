import { test, expect } from "@playwright/test";

test.describe("Mobile viewport", () => {
  test("login page renders correctly on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Schafer Shufflers/i })).toBeVisible();
    await expect(page.getByText(/Track steps.*Compete with your team/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /get started/i })).toBeVisible();
  });

  test("login form is usable on mobile", async ({ page }) => {
    await page.goto("/");
    const emailInput = page.getByLabel(/email/i);
    await emailInput.fill("user1@stepsprint.local");
    await expect(emailInput).toHaveValue("user1@stepsprint.local");
    await expect(page.getByRole("button", { name: /get started/i })).toBeEnabled();
  });

  test("user can sign in and reach home on mobile", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(/email/i).fill("user1@stepsprint.local");
    await page.getByRole("button", { name: /get started/i }).click();
    await expect(page.getByRole("heading", { name: /Participant Home/i })).toBeVisible({ timeout: 15000 });
  });

  test("tabs are visible when logged in", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(/email/i).fill("user1@stepsprint.local");
    await page.getByRole("button", { name: /get started/i }).click();
    await expect(page.getByRole("heading", { name: /Participant Home/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("tab-submit")).toBeVisible();
    await expect(page.getByTestId("tab-weekly-top-steppers")).toBeVisible();
    await expect(page.getByTestId("tab-team-standings")).toBeVisible();
  });

  test("Submit tab shows form when logged in", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(/email/i).fill("user1@stepsprint.local");
    await page.getByRole("button", { name: /get started/i }).click();
    await expect(page.getByRole("heading", { name: /Participant Home/i })).toBeVisible({ timeout: 15000 });
    await page.getByTestId("tab-submit").click();
    await expect(page.getByRole("heading", { name: /Submit steps/i })).toBeVisible({ timeout: 5000 });
  });

  test("submit form has date and steps inputs", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(/email/i).fill("user1@stepsprint.local");
    await page.getByRole("button", { name: /get started/i }).click();
    await expect(page.getByRole("heading", { name: /Participant Home/i })).toBeVisible({ timeout: 15000 });
    await page.getByTestId("tab-submit").click();
    await expect(page.getByRole("heading", { name: /Submit steps/i })).toBeVisible();
    await expect(page.getByLabel(/Date/i)).toBeVisible();
    await expect(page.getByLabel(/Steps/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /log steps/i })).toBeVisible();
  });

  test("viewport matches mobile dimensions", async ({ page }) => {
    await page.goto("/");
    const viewport = page.viewportSize();
    expect(viewport).toBeDefined();
    expect(viewport!.width).toBeLessThanOrEqual(450);
    expect(viewport!.height).toBeGreaterThan(600);
  });
});
