/** Last API `x-request-id` from a successful fetch — for correlating client errors with server logs. */
let lastApiRequestId: string | null = null;

export function noteApiRequestId(id: string | null): void {
  lastApiRequestId = id;
}

export function getLastApiRequestId(): string | null {
  return lastApiRequestId;
}
