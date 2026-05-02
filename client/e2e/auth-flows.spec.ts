/**
 * E2E tests for auth flows: forgot-password and reset-password pages.
 *
 * Password reset emails are no-ops in the test environment (no SMTP configured),
 * so these tests cover the UI behaviour only — form submission, success/error
 * messages, and navigation links. The full token redemption path is covered by
 * server-side unit tests.
 */
import { test, expect } from "@playwright/test";

test.describe("Forgot password flow", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("login page shows forgot password link", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /forgot password/i })).toBeVisible();
  });

  test("forgot-password page renders", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByRole("heading", { name: /reset password/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /send reset link/i })).toBeVisible();
  });

  test("submit button is disabled when email is empty", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByRole("button", { name: /send reset link/i })).toBeDisabled();
  });

  test("submitting a valid email shows the confirmation message", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel(/email/i).fill("user1@stepsprint.local");
    await page.getByRole("button", { name: /send reset link/i }).click();
    await expect(
      page.getByText(/reset link has been sent|check your email/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("invalid email format shows validation error", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel(/email/i).fill("notanemail");
    await page.getByRole("button", { name: /send reset link/i }).click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 5_000 });
  });

  test("back to sign in link navigates to login", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByRole("link", { name: /back to sign in/i }).click();
    await expect(page.getByRole("heading", { name: /StepSprint/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });
});

test.describe("Reset password page", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("visiting /reset-password without params shows invalid link error", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { name: /invalid link/i })).toBeVisible();
    await expect(
      page.getByText(/invalid or incomplete/i)
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /request a new reset link/i })
    ).toBeVisible();
  });

  test("visiting /reset-password with token+email shows the password form", async ({ page }) => {
    await page.goto("/reset-password?token=sometoken&email=user1%40stepsprint.local");
    await expect(page.getByRole("heading", { name: /set new password/i })).toBeVisible();
    await expect(page.getByLabel(/new password/i)).toBeVisible();
    await expect(page.getByLabel(/confirm new password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /reset password/i })).toBeVisible();
  });

  test("reset password form validates weak password", async ({ page }) => {
    await page.goto("/reset-password?token=sometoken&email=user1%40stepsprint.local");
    await page.getByLabel(/new password/i).fill("weak");
    await page.getByLabel(/confirm new password/i).fill("weak");
    await page.getByRole("button", { name: /reset password/i }).click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 5_000 });
  });

  test("reset password form shows error for mismatched passwords", async ({ page }) => {
    await page.goto("/reset-password?token=sometoken&email=user1%40stepsprint.local");
    await page.getByLabel(/new password/i).fill("NewPass1!");
    await page.getByLabel(/confirm new password/i).fill("DifferentPass1!");
    await page.getByRole("button", { name: /reset password/i }).click();
    await expect(page.getByText(/do not match/i)).toBeVisible({ timeout: 5_000 });
  });

  test("reset password with an invalid token shows an error from the API", async ({ page }) => {
    await page.goto("/reset-password?token=invalid-token-xyz&email=user1%40stepsprint.local");
    await page.getByLabel(/new password/i).fill("NewPass1!");
    await page.getByLabel(/confirm new password/i).fill("NewPass1!");
    await page.getByRole("button", { name: /reset password/i }).click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10_000 });
  });
});
