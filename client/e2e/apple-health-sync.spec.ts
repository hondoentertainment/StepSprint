/**
 * E2E tests for fitness sync UI (Apple Health token + OAuth providers UI).
 *
 * Seed data required (provided by server/src/seed.ts):
 *   user1@stepsprint.local / password123 — participant enrolled in the demo challenge.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsSeededParticipant } from "./test-helpers";

async function navigateToIntegrations(page: Page): Promise<void> {
  await page.getByTestId("tab-devices").click();
  await expect(
    page.getByRole("heading", { name: /Fitness sync|Sincronización fitness/i })
  ).toBeVisible();
}

test.describe("Fitness sync (Devices)", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("Devices tab is visible after login", async ({ page }) => {
    await loginAsSeededParticipant(page);
    await expect(page.getByTestId("tab-devices")).toBeVisible();
  });

  test("Fitness sync panel shows Apple section on Devices tab", async ({ page }) => {
    await loginAsSeededParticipant(page);
    await navigateToIntegrations(page);

    await expect(
      page.getByRole("heading", { name: /Apple Watch \/ Apple Health/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Generate new token|Generar nuevo token/i })
    ).toBeVisible();
  });

  test("generate a new token and see it revealed once", async ({ page }) => {
    await loginAsSeededParticipant(page);
    await navigateToIntegrations(page);

    await page.getByRole("button", { name: /Generate new token|Generar nuevo token/i }).click();

    await expect(page.getByText(/Token created|Token creado/i)).toBeVisible({ timeout: 10_000 });
    const tokenEl = page.locator("code.token-value");
    await expect(tokenEl).toBeVisible();

    const tokenText = await tokenEl.textContent();
    expect(tokenText).toMatch(/^ssp_[0-9a-f]{64}$/);

    await expect(
      page.getByRole("button", { name: /Copy token|Copiar token/i })
    ).toBeVisible();
  });

  test("generated token appears in the token list", async ({ page }) => {
    await loginAsSeededParticipant(page);
    await navigateToIntegrations(page);

    await page.getByRole("button", { name: /Generate new token|Generar nuevo token/i }).click();
    await expect(page.getByText(/Token created|Token creado/i)).toBeVisible({ timeout: 10_000 });

    await expect(
      page
        .locator(".token-label")
        .filter({ hasText: /Apple Watch Sync|Sincronización Apple Watch/i })
        .first()
    ).toBeVisible();
  });

  test("reveals iOS Shortcut setup instructions", async ({ page }) => {
    await loginAsSeededParticipant(page);
    await navigateToIntegrations(page);

    await page.getByRole("button", { name: /Generate new token|Generar nuevo token/i }).click();
    await expect(page.getByText(/Token created|Token creado/i)).toBeVisible({ timeout: 10_000 });

    await page.locator(".token-reveal details.shortcut-guide summary").click();

    await expect(
      page.getByText(/Open the Shortcuts app on your iPhone|Abre la app Atajos en el iPhone/i)
    ).toBeVisible();
    await expect(
      page.getByText(/Get Contents of URL|Obtener contenidos de URL/i)
    ).toBeVisible();
    await expect(page.getByText(/Authorization|Bearer/)).toBeVisible();
  });

  test("revoke a token removes it from the list", async ({ page }) => {
    await loginAsSeededParticipant(page);
    await navigateToIntegrations(page);

    await page.getByRole("button", { name: /Generate new token|Generar nuevo token/i }).click();
    await expect(page.getByText(/Token created|Token creado/i)).toBeVisible({ timeout: 10_000 });

    const tokenRows = page.locator(".token-row");
    const countBefore = await tokenRows.count();
    expect(countBefore).toBeGreaterThan(0);

    const rowToRevoke = tokenRows.first();
    const revokeResponsePromise = page.waitForResponse(
      (r) =>
        r.request().method() === "DELETE" && /\/api\/integrations\/tokens\//.test(r.url())
    );
    await rowToRevoke.getByRole("button", { name: /Revoke|Revocar/i }).click();
    const revokeResp = await revokeResponsePromise;
    expect(revokeResp.status()).toBe(204);

    await expect(tokenRows).toHaveCount(countBefore - 1, { timeout: 15_000 });
  });

  test("other trackers section lists Fitbit, Google Fit, and Garmin with not-configured badges when OAuth is off", async ({
    page,
  }) => {
    await loginAsSeededParticipant(page);
    await navigateToIntegrations(page);

    await expect(
      page.getByRole("heading", { name: /Apple Watch \/ Apple Health/i })
    ).toBeVisible();

    await expect(
      page.getByRole("heading", {
        name: /Fitbit, Google Fit, and Garmin|Fitbit, Google Fit y Garmin/i,
      })
    ).toBeVisible();
    await expect(page.getByText(/Not configured|No configurado/i).first()).toBeVisible();
  });
});
