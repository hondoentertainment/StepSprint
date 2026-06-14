/**
 * E2E tests for the OAuth sync controls (date picker + Last 7 / Last 30 pills
 * + Backfill-since affordance) on the Devices tab.
 *
 * The seeded dev environment doesn't ship OAuth client credentials, so these
 * tests mock `GET /api/integrations/fitness` to expose Fitbit as connected.
 * That keeps the assertions focused on the new client-side flow and avoids
 * any dependence on the upstream Fitbit API.
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

type FitnessProviderRow = {
  id: string;
  name: string;
  available: boolean;
  connected: boolean;
  connectedAt: string | null;
  lastSyncedAt: string | null;
};

function buildFitnessResponse(overrides: Partial<FitnessProviderRow> = {}) {
  const fitbit: FitnessProviderRow = {
    id: "fitbit",
    name: "Fitbit",
    available: true,
    connected: true,
    connectedAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    lastSyncedAt: null,
    ...overrides,
  };
  return {
    connected: true,
    lastAppleHealthSyncAt: null,
    providers: [
      {
        id: "apple_health",
        name: "Apple Health / Apple Watch",
        available: true,
        connected: false,
        connectedAt: null,
        lastSyncedAt: null,
      },
      fitbit,
      {
        id: "google_fit",
        name: "Google Fit",
        available: false,
        connected: false,
        connectedAt: null,
        lastSyncedAt: null,
      },
      {
        id: "garmin",
        name: "Garmin Connect",
        available: false,
        connected: false,
        connectedAt: null,
        lastSyncedAt: null,
      },
    ],
    message: "ok",
  };
}

async function mockFitnessStatus(
  page: Page,
  responseBuilder: () => unknown
): Promise<void> {
  await page.route(
    (url) => /\/api\/integrations\/fitness(\?|$)/.test(url.pathname + url.search),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(responseBuilder()),
      });
    }
  );
}

test.describe("OAuth sync controls (Devices)", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("mode pills toggle the date picker visibility and update the hint", async ({ page }) => {
    await mockFitnessStatus(page, () => buildFitnessResponse());
    await loginAsSeededParticipant(page);
    await navigateToIntegrations(page);

    const singlePill = page.getByRole("radio", { name: /^One day$|^Un día$/i });
    const last7Pill = page.getByRole("radio", { name: /Last 7 days|Últimos 7 días/i });
    const last30Pill = page.getByRole("radio", { name: /Last 30 days|Últimos 30 días/i });

    await expect(singlePill).toHaveAttribute("aria-checked", "true");
    const dateInput = page.locator("#integration-sync-date-input");
    await expect(dateInput).toBeVisible();

    await last7Pill.click();
    await expect(last7Pill).toHaveAttribute("aria-checked", "true");
    await expect(singlePill).toHaveAttribute("aria-checked", "false");
    await expect(dateInput).toBeHidden();
    await expect(page.getByText(/Will pull|Traerá/i)).toBeVisible();

    await last30Pill.click();
    await expect(last30Pill).toHaveAttribute("aria-checked", "true");

    await singlePill.click();
    await expect(dateInput).toBeVisible();
  });

  test("sync sends `date` in single mode and `startDate`+`endDate` in range mode", async ({ page }) => {
    await mockFitnessStatus(page, () => buildFitnessResponse());

    const capturedBodies: Array<Record<string, unknown>> = [];
    await page.route(
      (url) => /\/api\/integrations\/fitbit\/sync$/.test(url.pathname),
      async (route) => {
        const raw = route.request().postData();
        capturedBodies.push(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ imported: 1, updated: 0, skipped: 0 }),
        });
      }
    );

    await loginAsSeededParticipant(page);
    await navigateToIntegrations(page);

    // Single-day mode (default): body should carry `date`, not a range.
    await page.getByRole("button", { name: /^Sync today$|^Sincronizar hoy$/i }).click();
    await expect.poll(() => capturedBodies.length, { timeout: 10_000 }).toBe(1);
    expect(capturedBodies[0]?.date as unknown).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(capturedBodies[0]?.startDate).toBeUndefined();
    expect(capturedBodies[0]?.endDate).toBeUndefined();

    // Switch to "Last 7 days" — body should carry the range and no `date`.
    await page.getByRole("radio", { name: /Last 7 days|Últimos 7 días/i }).click();
    await page
      .getByRole("button", { name: /Sync last \d+ days|Sincronizar últimos \d+ días/i })
      .click();
    await expect.poll(() => capturedBodies.length, { timeout: 10_000 }).toBe(2);
    expect(capturedBodies[1]?.startDate as unknown).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(capturedBodies[1]?.endDate as unknown).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(capturedBodies[1]?.date).toBeUndefined();
  });

  test("renders Last synced and a Backfill-since action when lastSyncedAt is present", async ({ page }) => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000).toISOString();
    await mockFitnessStatus(page, () => buildFitnessResponse({ lastSyncedAt: fiveDaysAgo }));

    const capturedBodies: Array<Record<string, unknown>> = [];
    await page.route(
      (url) => /\/api\/integrations\/fitbit\/sync$/.test(url.pathname),
      async (route) => {
        const raw = route.request().postData();
        capturedBodies.push(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ imported: 5, updated: 0, skipped: 0 }),
        });
      }
    );

    await loginAsSeededParticipant(page);
    await navigateToIntegrations(page);

    await expect(
      page.getByText(/Last synced|Sincronizado por última vez/i).first()
    ).toBeVisible();

    const backfillBtn = page.getByRole("button", {
      name: /Backfill \d+ day|Rellenar \d+ día/i,
    });
    await expect(backfillBtn).toBeVisible();
    await backfillBtn.click();

    await expect.poll(() => capturedBodies.length, { timeout: 10_000 }).toBe(1);
    // Backfill-since always sends a range, never a single `date`.
    expect(capturedBodies[0]?.startDate as unknown).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(capturedBodies[0]?.endDate as unknown).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(capturedBodies[0]?.date).toBeUndefined();
  });
});
