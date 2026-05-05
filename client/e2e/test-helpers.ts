import { expect, type Page } from "@playwright/test";

/** Primary sign-in CTA on Login (`en.json` / `es.json` + legacy E2E copy). */
export const loginSubmitButton = /sign in|get started|log in|iniciar sesión/i;

/** Logged-in home `<h2>` from i18n (`home.title`) plus legacy E2E strings. */
export const participantHomeHeading =
  /Your Dashboard|Participant Home|Inicio del participante/i;

export async function loginAsSeededParticipant(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel(/email|correo/i).first().fill("user1@stepsprint.local");
  await page.getByLabel(/password|contraseña/i).first().fill("password123");
  await page.getByRole("button", { name: loginSubmitButton }).first().click();
  await expect(page.getByRole("heading", { name: participantHomeHeading })).toBeVisible({
    timeout: 15_000,
  });
  // Participant is only on the seeded demo challenge / teams; other challenges from prior E2E runs may exist.
  await page
    .getByRole("combobox", { name: /select challenge|seleccionar reto/i })
    .selectOption({ label: "StepSprint Demo" });
}

export async function loginAsSeededAdmin(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel(/email|correo/i).first().fill("admin@stepsprint.local");
  await page.getByLabel(/password|contraseña/i).first().fill("password123");
  await page.getByRole("button", { name: loginSubmitButton }).first().click();
  await expect(page.getByTestId("tab-admin")).toBeVisible({ timeout: 15_000 });
}
