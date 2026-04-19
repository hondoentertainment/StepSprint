import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

vi.mock("../sentry", () => ({
  captureException: vi.fn(),
  initSentry: vi.fn(),
  isSentryInitialized: () => false,
}));

function Boom(): React.ReactElement {
  throw new Error("kaboom");
}

describe("ErrorBoundary", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // React logs to console.error when a boundary catches — silence it.
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <div>hello world</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("renders fallback UI when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(
      screen.getByRole("heading", { name: /something went wrong/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/kaboom/i)).toBeInTheDocument();
  });

  it("forwards caught errors to Sentry via captureException", async () => {
    const sentry = await import("../sentry");
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    const [err, ctx] = (sentry.captureException as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("kaboom");
    expect(ctx).toHaveProperty("componentStack");
  });

  it("renders a custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<p>custom fallback</p>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("custom fallback")).toBeInTheDocument();
  });
});
