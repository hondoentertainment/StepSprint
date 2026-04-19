import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { Login } from "./Login";

function renderLogin() {
  const onLogin = vi.fn().mockResolvedValue({
    id: "1",
    email: "a@b.com",
    role: "MEMBER",
  });
  const onRegister = vi.fn().mockResolvedValue({
    id: "1",
    email: "a@b.com",
    role: "MEMBER",
  });
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <Login onLogin={onLogin} onRegister={onRegister} />
      </MemoryRouter>
    </I18nextProvider>
  );
  return { ...utils, onLogin, onRegister };
}

describe("Login (i18n)", () => {
  it("renders translated email and password labels and submit button", () => {
    renderLogin();

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign in" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /forgot password/i })
    ).toBeInTheDocument();
  });

  it("shows the translated email-required error when submitting empty form", () => {
    renderLogin();

    // Try to submit with empty fields — button is disabled, so use form submit
    const emailInput = screen.getByLabelText("Email");
    const form = emailInput.closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    expect(
      screen.getByText("Please enter your email address.")
    ).toBeInTheDocument();
  });

  it("switches to registration mode with translated title", () => {
    renderLogin();

    fireEvent.click(
      screen.getByRole("button", { name: /don't have an account/i })
    );

    expect(
      screen.getByRole("heading", { name: "Create account" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create account" })
    ).toBeInTheDocument();
  });
});
