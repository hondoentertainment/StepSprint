import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { loginAsSeededParticipant, participantHomeHeading } from "./test-helpers";

/**
 * Run axe against the current page and assert no `serious` or `critical`
 * violations are present. Minor/moderate issues are logged but don't fail —
 * this is an a11y smoke test, not a full audit.
 */
async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .disableRules(["color-contrast"])
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical"
  );

  if (blocking.length > 0) {
    const summary = blocking
      .map((v) => `${v.id} (${v.impact}): ${v.help}`)
      .join("\n");
    expect(blocking, `Blocking a11y violations:\n${summary}`).toEqual([]);
  }
}

test.describe("Accessibility smoke", () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 1280, height: 720 } });

  test("/login renders with no serious/critical axe violations", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel(/email|correo/i)).toBeVisible();
    await expectNoSeriousAxeViolations(page);
  });

  test("Home (/) after login has no serious/critical axe violations", async ({ page }) => {
    await loginAsSeededParticipant(page);
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: participantHomeHeading })).toBeVisible({
      timeout: 15_000,
    });
    await expectNoSeriousAxeViolations(page);
  });

  test("/submit has no serious/critical axe violations", async ({ page }) => {
    await loginAsSeededParticipant(page);
    await page.goto("/submit");
    await expect(page.getByRole("heading", { name: /Submit steps|Registrar pasos/i })).toBeVisible({
      timeout: 15_000,
    });
    await expectNoSeriousAxeViolations(page);
  });
});
