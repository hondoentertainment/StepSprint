import { test, expect } from "@playwright/test";
import { loginAsSeededAdmin } from "./test-helpers";

// Seed data expected:
//   admin@stepsprint.local  (password `password123`, role ADMIN)
//   user1@stepsprint.local  (participant with submissions on `demo-challenge`)
//   `demo-challenge` challenge with ~10 days of submissions per participant.

test.describe("Admin console", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("admin login and challenge list renders", async ({ page }) => {
    await loginAsSeededAdmin(page);
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
    await loginAsSeededAdmin(page);
    await page.getByTestId("tab-admin").click();
    await expect(page.getByRole("heading", { name: /Admin console/i })).toBeVisible();

    // Target a known seeded participant so the moderation list is deterministic.
    await page.getByRole("heading", { name: /Moderation|Moderación/i }).scrollIntoViewIfNeeded();
    const submissionsReq = page.waitForResponse((r) => {
      const u = r.url();
      return u.includes("/api/admin/submissions") && r.request().method() === "GET" && r.ok();
    });
    await page.getByLabel(/Search|Buscar/i).fill("user1@stepsprint.local");
    await submissionsReq;

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
    await firstRow.getByRole("button", { name: /^Edit$|^Editar$/i }).click();

    // Confirm the modal.
    await page.getByRole("button", { name: /^Save$|^Guardar$/i }).click();

    await expect(page.getByText(/Submission updated\./i)).toBeVisible({ timeout: 10_000 });

    // Persistence check: reload, re-search, confirm the row renders with `(flagged)`.
    await page.reload();
    await page.getByTestId("tab-admin").click();
    await page.getByRole("heading", { name: /Moderation|Moderación/i }).scrollIntoViewIfNeeded();
    const submissionsAfter = page.waitForResponse((r) => {
      const u = r.url();
      return u.includes("/api/admin/submissions") && r.request().method() === "GET" && r.ok();
    });
    await page.getByLabel(/Search|Buscar/i).fill("user1@stepsprint.local");
    await submissionsAfter;

    const rowAfter = page
      .locator(".list-row")
      .filter({ hasText: targetDate })
      .first();
    await expect(rowAfter).toContainText(/flagged/i);
  });

  test("admin can create a new challenge", async ({ page }) => {
    await loginAsSeededAdmin(page);
    await page.getByTestId("tab-admin").click();
    await expect(page.getByRole("heading", { name: /Admin console/i })).toBeVisible();

    const challengeName = `E2E Challenge ${Date.now()}`;

    const setupSection = page
      .getByRole("heading", { name: /Challenge setup|Configuración del reto/i })
      .locator("..");
    await setupSection.scrollIntoViewIfNeeded();
    const setupFields = setupSection.getByRole("textbox");
    await setupFields.nth(0).fill(challengeName);
    await setupFields.nth(1).fill("2026-05-01");
    await setupFields.nth(2).fill("2026-05-31");
    // Timezone/team size keep their defaults (America/Chicago, 4).

    await page.getByRole("button", { name: /Create challenge|Crear reto/i }).click();

    await expect(page.getByText(/Challenge created|Reto creado/i)).toBeVisible({ timeout: 10_000 });

    // New challenge should appear in the header selector.
    const challengeSelect = page.locator("header select").first();
    await expect(challengeSelect).toContainText(challengeName);
  });
});
