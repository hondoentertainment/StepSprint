const API_BASE = (import.meta.env.VITE_API_URL as string)?.replace(/\/$/, "") ?? "";

const CSRF_COOKIE = "stepsprint_csrf";
const CSRF_HEADER = "x-csrf-token";
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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

function getCsrfToken(): string {
  const entry = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith(`${CSRF_COOKIE}=`));
  return entry ? entry.split("=").slice(1).join("=").trim() : "";
}

export async function api<T>(path: string, options: RequestInit = {}) {
  const method = ((options.method as string | undefined) ?? "GET").toUpperCase();
  const isMutation = MUTATION_METHODS.has(method);

  const response = await fetch(getApiUrl(path), {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(isMutation ? { [CSRF_HEADER]: getCsrfToken() } : {}),
    },
    ...options,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(payload.error ?? "Request failed", response.status);
  }
  return response.json() as Promise<T>;
}
