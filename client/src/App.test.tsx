import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

// Mock fetch for unauthenticated state - app will show login
describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL) => {
        const s = String(url);
        if (s.includes("auth/me")) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: () => Promise.resolve({}),
          } as Response);
        }
        return Promise.reject(new Error(`Unexpected fetch: ${s}`));
      })
    );
  });

  it("shows login form when not authenticated", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: /Schafer Shufflers/i });
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });
});
