import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendEmail, _resetEmailTransporterForTests } from "./email";
import { config } from "../config";

const ORIGINAL_FETCH = globalThis.fetch;

describe("services/email — transport selection", () => {
  beforeEach(() => {
    _resetEmailTransporterForTests();
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
    // Restore the real transports the rest of the test suite expects.
    vi.unstubAllGlobals();
    Object.assign(config, { resendApiKey: undefined, smtp: null });
  });

  it("falls back to dev-mode log when neither Resend nor SMTP is configured", async () => {
    Object.assign(config, { resendApiKey: undefined, smtp: null });
    const result = await sendEmail({ to: "x@y.test", subject: "s", text: "t" });
    expect(result).toEqual({ transport: "log", reason: "no_transport_configured" });
  });

  it("posts to Resend's HTTP API when RESEND_API_KEY is set", async () => {
    Object.assign(config, { resendApiKey: "re_test_abc" });

    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "msg-123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const result = await sendEmail({
      to: "user@example.com",
      subject: "Hello",
      text: "Body",
      html: "<p>Body</p>",
    });

    expect(result).toEqual({ transport: "resend", id: "msg-123" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test_abc");
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(((init as RequestInit).body as string) ?? "{}");
    expect(body).toMatchObject({
      to: "user@example.com",
      subject: "Hello",
      text: "Body",
      html: "<p>Body</p>",
    });
    expect(typeof body.from).toBe("string");
  });

  it("surfaces Resend error responses with parsed name + message", async () => {
    Object.assign(config, { resendApiKey: "re_bad" });

    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          name: "validation_error",
          message: "From is not verified",
        }),
        { status: 422, headers: { "content-type": "application/json" } }
      )
    );
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    await expect(
      sendEmail({ to: "user@example.com", subject: "x", text: "y" })
    ).rejects.toThrow(/Resend API 422.*validation_error.*From is not verified/u);
  });

  it("surfaces a clear error when Resend takes too long", async () => {
    Object.assign(config, { resendApiKey: "re_slow" });

    // Reject with an AbortError to mimic the 10s timeout firing.
    const fetchSpy = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((_, reject) => {
          const err =
            typeof DOMException === "function"
              ? new DOMException("aborted", "AbortError")
              : Object.assign(new Error("aborted"), { name: "AbortError" });
          // Schedule the rejection so the AbortController can be wired in
          // before `await` settles, mirroring real fetch behaviour.
          queueMicrotask(() => reject(err));
        })
    );
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    await expect(
      sendEmail({ to: "user@example.com", subject: "x", text: "y" })
    ).rejects.toThrow(/Resend request failed/u);
  });

  it("prefers Resend over SMTP when both are configured", async () => {
    // When BOTH transports are set, the priority order documented in the
    // module header (Resend → SMTP → log) must be honoured: Resend wins.
    Object.assign(config, {
      resendApiKey: "re_winning",
      smtp: {
        host: "smtp.example.test",
        port: 587,
        user: "u",
        pass: "p",
        from: "noreply@example.test",
      },
    });

    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "won-by-resend" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const result = await sendEmail({
      to: "user@example.com",
      subject: "Priority test",
      text: "Body",
    });

    expect(result).toEqual({ transport: "resend", id: "won-by-resend" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
