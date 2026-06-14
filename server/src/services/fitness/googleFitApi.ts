import { config } from "../../config";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

export function googleFitConfigured(): boolean {
  return Boolean(config.googleClientId && config.googleClientSecret);
}

export async function googleExchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: config.googleClientId ?? "",
    client_secret: config.googleClientSecret ?? "",
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${t}`);
  }
  return res.json() as Promise<TokenResponse>;
}

export async function googleRefresh(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: config.googleClientId ?? "",
    client_secret: config.googleClientSecret ?? "",
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Google refresh failed: ${res.status} ${t}`);
  }
  return res.json() as Promise<TokenResponse>;
}

type AggregateResponse = {
  bucket?: {
    startTimeMillis?: string;
    endTimeMillis?: string;
    dataset?: { point?: { value?: { intVal?: number }[] }[] }[];
  }[];
};

/** Daily totals keyed by startTimeMillis (UTC bucket start from API). */
export async function googleFetchDailySteps(
  accessToken: string,
  startTimeMillis: number,
  endTimeMillis: number
): Promise<Map<string, number>> {
  const body = {
    aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
    bucketByTime: { durationMillis: 86400000 },
    startTimeMillis,
    endTimeMillis,
  };
  const res = await fetch("https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Google Fitness aggregate failed: ${res.status} ${t}`);
  }
  const data = (await res.json()) as AggregateResponse;
  const map = new Map<string, number>();
  for (const b of data.bucket ?? []) {
    const key = b.startTimeMillis ?? "";
    let sum = 0;
    for (const ds of b.dataset ?? []) {
      for (const pt of ds.point ?? []) {
        for (const v of pt.value ?? []) {
          if (typeof v.intVal === "number") sum += v.intVal;
        }
      }
    }
    map.set(key, sum);
  }
  return map;
}
