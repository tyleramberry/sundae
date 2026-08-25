"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { trackMetaLeadOnce, trackMetaStartTrialOnce } from "@/lib/meta/pixel";

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

    // Legacy success_url landed on /dashboard?checkout=success. Current
    // Checkout returns to /subscribe?checkout=success and StartTrial fires
    // from the confirming UI once the user is entitled — don't double-fire
    // on the subscribe confirming screen from the query alone.
    if (checkout === "success" && pathname === "/dashboard") {
      trackMetaStartTrialOnce();
      next.delete("checkout");
      next.delete("session_id");
      changed = true;
    }

    if (!changed) return;
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, router, searchParams]);

  return null;
}
