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

export async function api<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(getApiUrl(path), {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(payload.error ?? "Request failed", response.status);
  }
  return response.json() as Promise<T>;
}
