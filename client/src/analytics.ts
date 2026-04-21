type Properties = Record<string, unknown>;
type Traits = Record<string, unknown>;

type PostHogLike = {
  init: (key: string, options?: Record<string, unknown>) => void;
  capture: (event: string, properties?: Properties) => void;
  identify: (userId: string, traits?: Traits) => void;
};

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

async function loadPostHog(): Promise<PostHogLike | null> {
  const key = getKey();
  if (!key) return null;
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
  if (!key) {
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
  if (!key) {
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
