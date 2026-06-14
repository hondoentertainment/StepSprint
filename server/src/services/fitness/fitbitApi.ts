import { config } from "../../config";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

function basicAuthHeader(): string {
  const id = config.fitbitClientId ?? "";
  const secret = config.fitbitClientSecret ?? "";
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

export function fitbitConfigured(): boolean {
  return Boolean(config.fitbitClientId && config.fitbitClientSecret);
}

export async function fitbitExchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: config.fitbitClientId ?? "",
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch("https://api.fitbit.com/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Fitbit token exchange failed: ${res.status} ${t}`);
  }
  return res.json() as Promise<TokenResponse>;
}

export async function fitbitRefresh(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch("https://api.fitbit.com/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Fitbit refresh failed: ${res.status} ${t}`);
  }
  return res.json() as Promise<TokenResponse>;
}

export async function fitbitFetchProfileUserId(accessToken: string): Promise<string> {
  const res = await fetch("https://api.fitbit.com/1/user/-/profile.json", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Fitbit profile failed: ${res.status} ${t}`);
  }
  const data = (await res.json()) as { user?: { encodedId?: string } };
  return data.user?.encodedId ?? "-";
}

/** Steps for a calendar date (yyyy-MM-dd) in the user's Fitbit account context. */
export async function fitbitFetchStepsForDate(accessToken: string, dateIso: string): Promise<number> {
  const res = await fetch(`https://api.fitbit.com/1/user/-/activities/steps/date/${dateIso}/1d.json`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Fitbit steps failed: ${res.status} ${t}`);
  }
  const data = (await res.json()) as {
    "activities-steps"?: { dateTime?: string; value?: string }[];
  };
  const row = data["activities-steps"]?.[0];
  const raw = row?.value ?? "0";
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : 0;
}
