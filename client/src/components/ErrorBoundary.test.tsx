import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom({ explode }: { explode: boolean }) {
  if (explode) {
    throw new Error("kaboom");
  }
  return <div>all good</div>;
}

describe("ErrorBoundary", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // React logs caught errors to console.error; silence for clean test output
    // while still allowing us to assert our own log.
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("renders children when no error is thrown", () => {
    render(
      <ErrorBoundary>
        <Boom explode={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText("all good")).toBeInTheDocument();
  });

  it("renders the fallback UI when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom explode={true} />
      </ErrorBoundary>
    );

    expect(
      screen.getByRole("heading", { name: /something went wrong/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i })
    ).toBeInTheDocument();

    // Confirms our logging hook ran (among other React error logs)
    const loggedOurError = errorSpy.mock.calls.some((call) =>
      call.some(
        (arg) =>
          typeof arg === "string" && arg.includes("[ErrorBoundary]")
      )
    );
    expect(loggedOurError).toBe(true);
  });

  it("resets and re-renders children when Try again is clicked", () => {
    function Harness() {
      const [explode, setExplode] = useState(true);
      return (
        <div>
          <button type="button" onClick={() => setExplode(false)}>
            fix it
          </button>
          <ErrorBoundary>
            <Boom explode={explode} />
          </ErrorBoundary>
        </div>
      );
    }

    render(<Harness />);

    expect(
      screen.getByRole("heading", { name: /something went wrong/i })
    ).toBeInTheDocument();

    // Fix the underlying state first, then reset the boundary
    fireEvent.click(screen.getByRole("button", { name: /fix it/i }));
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByText("all good")).toBeInTheDocument();
  });
});
