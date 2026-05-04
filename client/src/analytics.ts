type Properties = Record<string, unknown>;
type Traits = Record<string, unknown>;

/** PostHog event names used in product code — keep stable for dashboards; change only with a migration plan. */
export const ANALYTICS_EVENTS = {
  challengeViewed: "challenge_viewed",
  submissionCreated: "submission_created",
} as const;

type PostHogLike = {
  init: (key: string, options?: Record<string, unknown>) => void;
  capture: (event: string, properties?: Properties) => void;
  identify: (userId: string, traits?: Traits) => void;
};

const CONSENT_KEY = "stepsprint_analytics_consent";

let posthogPromise: Promise<PostHogLike | null> | null = null;
let ready: PostHogLike | null = null;

function getKey(): string | undefined {
  return import.meta.env.VITE_POSTHOG_KEY as string | undefined;
}

function getHost(): string {
  return (
    (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
    "https://us.i.posthog.com"
  );
}

function isDev(): boolean {
  return import.meta.env.MODE !== "production";
}

/** In production, PostHog loads only after explicit opt-in (banner). Dev/test loads without that gate. */
export function hasAnalyticsConsent(): boolean {
  if (!isDev()) {
    try {
      return localStorage.getItem(CONSENT_KEY) === "accepted";
    } catch {
      return false;
    }
  }
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v !== "declined";
  } catch {
    return true;
  }
}

export function grantAnalyticsConsent(): void {
  try {
    localStorage.setItem(CONSENT_KEY, "accepted");
  } catch {
    /* ignore */
  }
  posthogPromise = null;
  ready = null;
}

export function declineAnalyticsConsent(): void {
  try {
    localStorage.setItem(CONSENT_KEY, "declined");
  } catch {
    /* ignore */
  }
  posthogPromise = null;
  ready = null;
}

async function loadPostHog(): Promise<PostHogLike | null> {
  const key = getKey();
  if (!key || !hasAnalyticsConsent()) return null;
  if (posthogPromise) return posthogPromise;

  posthogPromise = import("posthog-js")
    .then((mod) => {
      const posthog = (mod.default ?? mod) as unknown as PostHogLike;
      posthog.init(key, { api_host: getHost() });
      ready = posthog;
      return posthog;
    })
    .catch((err) => {
      if (isDev()) {
        console.debug("[analytics] failed to load posthog-js", err);
      }
      return null;
    });

  return posthogPromise;
}

export function track(event: string, properties?: Properties): void {
  const key = getKey();
  if (!key || !hasAnalyticsConsent()) {
    if (isDev()) {
      console.debug("[analytics] track (no-op)", event, properties);
    }
    return;
  }

  if (ready) {
    try {
      ready.capture(event, properties);
    } catch (err) {
      if (isDev()) console.debug("[analytics] capture failed", err);
    }
    return;
  }

  void loadPostHog().then((ph) => {
    if (!ph) return;
    try {
      ph.capture(event, properties);
    } catch (err) {
      if (isDev()) console.debug("[analytics] capture failed", err);
    }
  });
}

export function identify(userId: string, traits?: Traits): void {
  const key = getKey();
  if (!key || !hasAnalyticsConsent()) {
    if (isDev()) {
      console.debug("[analytics] identify (no-op)", userId, traits);
    }
    return;
  }

  if (ready) {
    try {
      ready.identify(userId, traits);
    } catch (err) {
      if (isDev()) console.debug("[analytics] identify failed", err);
    }
    return;
  }

  void loadPostHog().then((ph) => {
    if (!ph) return;
    try {
      ph.identify(userId, traits);
    } catch (err) {
      if (isDev()) console.debug("[analytics] identify failed", err);
    }
  });
}

/** True when a production build should show the cookie / analytics banner (key set, user has not chosen yet). */
export function shouldPromptAnalyticsConsent(): boolean {
  if (!import.meta.env.PROD || !getKey()) return false;
  try {
    return localStorage.getItem(CONSENT_KEY) === null;
  } catch {
    return false;
  }
}
