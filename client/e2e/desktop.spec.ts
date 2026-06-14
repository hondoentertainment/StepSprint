import { test, expect } from "@playwright/test";
import { loginAsSeededParticipant } from "./test-helpers";

test.describe("Desktop viewport", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("login page renders", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /StepSprint/i })).toBeVisible();
  });

  test("full login and navigation flow", async ({ page }) => {
    await loginAsSeededParticipant(page);
    await page.getByTestId("tab-submit").click();
    await expect(page.getByRole("heading", { name: /Submit steps|Registrar pasos/i })).toBeVisible();
    await page.getByTestId("tab-leaderboard").click();
    await expect(
      page.getByRole("heading", { name: /Weekly Top Steppers|Weekly Leaderboard|Top semanal/i })
    ).toBeVisible();
    await page.getByTestId("tab-teams").click();
    await expect(page.getByRole("heading", { name: /Team/i })).toBeVisible();
  });

  test("participant can submit steps and see success", async ({ page }) => {
    await loginAsSeededParticipant(page);
    await page.getByTestId("tab-submit").click();
    const stepsInput = page.locator("form input[type='number']");
    await expect(stepsInput).toBeVisible();
    await stepsInput.fill("4321");
    // Wait for the challenge selector to hydrate so challengeId is populated
    // and the submit button becomes enabled.
    const submitBtn = page.getByRole("button", { name: /log steps|registrar pasos/i });
    await expect(submitBtn).toBeEnabled({ timeout: 15_000 });
    await submitBtn.click();
    await expect(
      page.getByText(/Steps submitted successfully|Pasos registrados correctamente/i)
    ).toBeVisible({ timeout: 15_000 });
  });

  test("logout returns to login", async ({ page }) => {
    await loginAsSeededParticipant(page);
    await page.getByRole("button", { name: /log out|cerrar sesión/i }).click();
    await expect(page.getByRole("heading", { name: /StepSprint/i })).toBeVisible();
    await expect(page.getByLabel(/email|correo/i)).toBeVisible();
  });
});
