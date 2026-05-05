import { test, expect } from "@playwright/test";
import { loginAsSeededParticipant, loginSubmitButton } from "./test-helpers";

test.describe("Mobile viewport", () => {
  test("login page renders correctly on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /StepSprint/i })).toBeVisible();
    await expect(
      page.getByText(/Track steps|Registra pasos|Compete with your team|Compite con tu equipo/i)
    ).toBeVisible();
    await expect(page.getByLabel(/email|correo/i)).toBeVisible();
    await expect(page.getByRole("button", { name: loginSubmitButton })).toBeVisible();
  });

  test("login form is usable on mobile", async ({ page }) => {
    await page.goto("/");
    const emailInput = page.getByLabel(/email|correo/i).first();
    await emailInput.fill("user1@stepsprint.local");
    await expect(emailInput).toHaveValue("user1@stepsprint.local");
    await page.getByLabel(/password|contraseña/i).first().fill("password123");
    await expect(page.getByRole("button", { name: loginSubmitButton })).toBeEnabled();
  });

  test("user can sign in and reach home on mobile", async ({ page }) => {
    await loginAsSeededParticipant(page);
  });

  test("tabs are visible when logged in", async ({ page }) => {
    await loginAsSeededParticipant(page);
    await expect(page.getByTestId("tab-submit")).toBeVisible();
    await expect(page.getByTestId("tab-leaderboard")).toBeVisible();
    await expect(page.getByTestId("tab-teams")).toBeVisible();
  });

  test("Submit tab shows form when logged in", async ({ page }) => {
    await loginAsSeededParticipant(page);
    await page.getByTestId("tab-submit").click();
    await expect(page.getByRole("heading", { name: /Submit steps|Registrar pasos/i })).toBeVisible({
      timeout: 5000,
    });
  });

  test("submit form has date and steps inputs", async ({ page }) => {
    await loginAsSeededParticipant(page);
    await page.getByTestId("tab-submit").click();
    await expect(page.getByRole("heading", { name: /Submit steps|Registrar pasos/i })).toBeVisible();
    await expect(page.getByLabel(/Date|Fecha/i)).toBeVisible();
    await expect(page.locator("form input[type='number']")).toBeVisible();
    await expect(page.getByRole("button", { name: /log steps|registrar pasos/i })).toBeVisible();
  });

  test("viewport matches mobile dimensions", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "desktop-chrome",
      "Mobile projects set a phone-sized viewport; desktop-chrome uses 1280px."
    );
    await page.goto("/");
    const viewport = page.viewportSize();
    expect(viewport).toBeDefined();
    expect(viewport!.width).toBeLessThanOrEqual(450);
    expect(viewport!.height).toBeGreaterThan(600);
  });
});
