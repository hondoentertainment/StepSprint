import { noteApiRequestId } from "./requestContext";

const API_BASE = (import.meta.env.VITE_API_URL as string)?.replace(/\/$/, "") ?? "";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

export function getApiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

// ---------------------------------------------------------------------------
// CSRF token (double-submit cookie pattern)
// ---------------------------------------------------------------------------
// The server sets an httpOnly CSRF cookie and returns the matching token value
// in JSON. We cache it per page load and attach it as x-csrf-token on all
// mutating requests. Bearer-token requests (iOS Shortcuts, OAuth sync) bypass
// CSRF on the server side and don't need the header.

let _csrfToken: string | null = null;

const APIUnreachableHint =
  "Cannot reach the StepSprint API. If this is the hosted site, the API may be redeploying or unavailable — check the Vercel dashboard (Functions tab) and that the database is reachable.";

async function getCsrfToken(): Promise<string> {
  if (_csrfToken) return _csrfToken;
  let res: Response;
  try {
    res = await fetch(getApiUrl("/api/csrf-token"), { credentials: "include" });
  } catch {
    throw new ApiError(`Network error — ${APIUnreachableHint}`, 503);
  }
  if (!res.ok) {
    const detail =
      res.status === 404
        ? `API returned 404 — ${APIUnreachableHint}`
        : "Failed to fetch CSRF token";
    throw new ApiError(detail, res.status);
  }
  const data = (await res.json()) as { token: string };
  _csrfToken = data.token;
  return _csrfToken;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function api<T>(path: string, options: RequestInit = {}) {
  const method = (options.method ?? "GET").toUpperCase();

  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (MUTATING.has(method)) {
    try {
      baseHeaders["x-csrf-token"] = await getCsrfToken();
    } catch (e) {
      // Production needs a valid CSRF pair; dev may run the SPA without the API.
      if (import.meta.env.PROD) {
        throw e;
      }
    }
  }

  let response: Response;
  try {
    response = await fetch(getApiUrl(path), {
      credentials: "include",
      ...options,
      headers: baseHeaders,
    });
  } catch {
    throw new ApiError(`Network error — ${APIUnreachableHint}`, 503);
  }

  const reqId = response.headers.get("x-request-id");
  noteApiRequestId(reqId && reqId.length > 0 ? reqId : null);

  if (!response.ok) {
    // Clear cached CSRF token if the server rejects it so the next request
    // will fetch a fresh one.
    if (response.status === 403) _csrfToken = null;
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(payload.error ?? "Request failed", response.status);
  }

  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined as T;
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new ApiError("Invalid JSON response", response.status);
  }
}
