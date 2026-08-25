import { PostHog } from "posthog-node";

const DEFAULT_HOST = "https://us.i.posthog.com";

let client: PostHog | null = null;

function getPostHogKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  return key && key.trim() ? key.trim() : undefined;
}

function getPostHog(): PostHog | null {
  const key = getPostHogKey();
  if (!key) return null;
  if (!client) {
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || DEFAULT_HOST,
    });
  }
  return client;
}

export async function captureServerEvent({
  distinctId,
  event,
  properties,
}: {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
}): Promise<void> {
  try {
    const posthog = getPostHog();
    if (!posthog) return;
    // captureImmediate flushes in this posthog-node version (no public flush()).
    await posthog.captureImmediate({
      distinctId,
      event,
      properties,
    });
  } catch (err) {
    console.error("[analytics] captureServerEvent failed:", err);
  }
}
