import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Seeded participant credentials, mirroring desktop.spec.ts / admin.spec.ts.
const EMAIL = "user1@stepsprint.local";
const PASSWORD = "password123";

/**
 * Log in as the seeded participant and wait for the authed shell to render.
 * Mirrors the helper pattern in `admin.spec.ts`: fill email, fill password if the
 * field is visible, then click the primary CTA.
 */
async function loginAsParticipant(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel(/email/i).fill(EMAIL);
  const passwordField = page.getByLabel(/^password/i).first();
  if (await passwordField.isVisible().catch(() => false)) {
    await passwordField.fill(PASSWORD);
  }
  await page
    .getByRole("button", { name: /get started|log in|sign in/i })
    .first()
    .click();
  // The authed shell exposes the submit tab; wait for it rather than a specific
  // landing heading so the helper works regardless of which tab is default.
  await expect(page.getByTestId("tab-submit")).toBeVisible({ timeout: 15_000 });
}

/**
 * Run axe against the current page and assert no `serious` or `critical`
 * violations are present. Minor/moderate issues are logged but don't fail —
 * this is an a11y smoke test, not a full audit.
 */
async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical"
  );

  if (blocking.length > 0) {
    // Surface the first few violations in the failure message for debugging.
    const summary = blocking
      .map((v) => `${v.id} (${v.impact}): ${v.help}`)
      .join("\n");
    expect(blocking, `Blocking a11y violations:\n${summary}`).toEqual([]);
  }
}

test.describe("Accessibility smoke", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("/login renders with no serious/critical axe violations", async ({ page }) => {
    await page.goto("/");
    // When unauthenticated the app renders Login at `/`.
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expectNoSeriousAxeViolations(page);
  });

  test("Home (/) after login has no serious/critical axe violations", async ({ page }) => {
    await loginAsParticipant(page);
    // Authed root redirects to /home; wait for the Home heading to settle.
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: /Your Dashboard/i })).toBeVisible({
      timeout: 15_000,
    });
    await expectNoSeriousAxeViolations(page);
  });

  test("/submit has no serious/critical axe violations", async ({ page }) => {
    await loginAsParticipant(page);
    await page.goto("/submit");
    await expect(page.getByRole("heading", { name: /Submit steps/i })).toBeVisible({
      timeout: 15_000,
    });
    await expectNoSeriousAxeViolations(page);
  });
});
