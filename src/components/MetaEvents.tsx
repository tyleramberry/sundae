"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { trackMetaLeadOnce, trackMetaSubscribeOnce } from "@/lib/meta/pixel";

export default function MetaEvents() {
  if (!process.env.NEXT_PUBLIC_META_PIXEL_ID) return null;

  return (
    <Suspense fallback={null}>
      <MetaEventsInner />
    </Suspense>
  );
}

function MetaEventsInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const meta = searchParams.get("meta");
    const checkout = searchParams.get("checkout");
    let changed = false;
    const next = new URLSearchParams(searchParams.toString());

    if (meta === "lead") {
      trackMetaLeadOnce();
      next.delete("meta");
      changed = true;
    }

    // Checkout returns to /subscribe?checkout=success and Subscribe fires
    // from the confirming UI once the user is entitled. If the webhook
    // already entitled them before that page rendered, /subscribe redirects
    // to /weekly-session?checkout=success&sub=<subscription id> and it fires
    // here instead, with that id as the eventID that dedupes against CAPI
    // (no id -> no pixel event; see trackMetaSubscribeOnce). /dashboard is
    // the pre-freemium landing, kept for old links. Never fire on the
    // subscribe confirming screen from the query alone.
    if (checkout === "success" && (pathname === "/weekly-session" || pathname === "/dashboard")) {
      trackMetaSubscribeOnce(searchParams.get("sub"));
      next.delete("checkout");
      next.delete("session_id");
      next.delete("sub");
      changed = true;
    }

    if (!changed) return;
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, router, searchParams]);

  return null;
}
