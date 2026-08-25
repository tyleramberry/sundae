import { createHash } from "node:crypto";

const GRAPH_VERSION = "v21.0";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function pixelId(): string | undefined {
  const id = process.env.META_PIXEL_ID ?? process.env.NEXT_PUBLIC_META_PIXEL_ID;
  return id && /^\d+$/.test(id.trim()) ? id.trim() : undefined;
}

function accessToken(): string | undefined {
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  return token && token.trim() ? token.trim() : undefined;
}

// Server-side Subscribe for trial → paid. No-ops without keys; never throws
// to the caller (Stripe webhooks must still 200).
export async function sendMetaSubscribeEvent({
  email,
  eventId,
}: {
  email?: string | null;
  eventId?: string | null;
}): Promise<void> {
  const id = pixelId();
  const token = accessToken();
  if (!id || !token) return;

  const userData: Record<string, string[]> = {};
  if (email) {
    userData.em = [sha256Hex(email)];
  }

  const payload = {
    data: [
      {
        event_name: "Subscribe",
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        event_id: eventId ?? undefined,
        user_data: userData,
        custom_data: { currency: "USD", value: 12 },
      },
    ],
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${id}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[meta/capi] Subscribe event failed:", res.status, body);
    }
  } catch (err) {
    console.error("[meta/capi] Subscribe event failed:", err);
  }
}
