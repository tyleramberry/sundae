"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatFreePlanUsage, type PlanSummary } from "@/lib/weeklySession/freeTier";

// The persistent app shell nav (built for the Day 11 UI/UX polish pass).
// One clean rail on desktop, a top bar on mobile. Active state is driven by
// the pathname, not hand-passed props, so it stays correct on any nav path
// (sidebar click, deep link, browser back). Auth is enforced server-side in
// the (app) layout -- this component only needs the email to display, the
// plan line (freemium: free usage + Upgrade, or subscriber + Manage
// subscription), and a sign-out control.
type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const NAV: NavItem[] = [
  {
    href: "/weekly-session",
    label: "Weekly planning",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <rect x="3" y="4.5" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 2.5v4M16 2.5v4" />
      </svg>
    ),
  },
  {
    href: "/daily-follow-ups",
    label: "Daily follow-ups",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M9 11.5l2 2 4-4.5" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 12l4-2.5" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

const SIGN_OUT_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <path d="M15 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h9" />
    <path d="M10 12h10.5M17.5 8.5 21 12l-3.5 3.5" />
  </svg>
);

const BILLING_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M3 10h18" />
    <path d="M7 15h3" />
  </svg>
);

const TUTORIAL_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 0 1 4.5 1.5c0 1.5-2.5 2-2.5 2" />
    <circle cx="12" cy="16.5" r="0.5" fill="currentColor" stroke="none" />
  </svg>
);

export default function AppSidebar({
  email,
  plan,
}: {
  email: string | null;
  plan: PlanSummary | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  // The weekly-session split view is the one screen actively competing
  // with the sidebar for horizontal room (chat + live plan/calendar
  // panel), so the rail collapses to icons-only for the whole route --
  // not just one internal stage of it -- freeing that space back up.
  // Desktop-only in effect: the mobile top bar is already icon-only
  // regardless of this, so collapsing it further would do nothing.
  const collapsed = pathname.startsWith("/weekly-session");

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  async function openPortal() {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.url !== "string") {
        setPortalError(body.error ?? "Couldn't open billing settings.");
        setPortalLoading(false);
        return;
      }
      window.location.assign(body.url);
    } catch {
      setPortalError("Couldn't open billing settings.");
      setPortalLoading(false);
    }
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    // `md:h-full` (not `md:h-screen`) -- the parent (app) layout row is
    // already clamped to exactly the viewport height, and stretching to
    // that bounded parent (rather than an independent 100vh) is what keeps
    // this rail's own height in sync with it. `md:mt-auto` further down
    // then pins the email/sign-out block to the bottom of *that* height,
    // not the bottom of the page -- so it stays put no matter how long the
    // weekly-session chat grows, instead of scrolling away with the page.
    <aside
      className={[
        "flex shrink-0 flex-row items-center justify-between gap-2 bg-night px-4 py-3 text-white md:h-full md:flex-col md:items-stretch md:justify-start md:gap-1 md:py-7 md:transition-[width] md:duration-150",
        collapsed ? "md:w-[68px] md:px-2" : "md:w-60 md:px-4",
      ].join(" ")}
    >
      <Link
        href="/dashboard"
        title="Sundae"
        className={[
          "melt melt-hover text-xl leading-none text-white md:mb-8",
          collapsed ? "md:px-0 md:text-center" : "md:px-2",
        ].join(" ")}
      >
        <span className={collapsed ? "md:hidden" : ""}>Sundae</span>
        <span className={collapsed ? "hidden md:inline" : "hidden"}>S</span>
      </Link>

      <nav className="flex flex-row gap-0.5 md:flex-1 md:flex-col md:gap-1">
        {NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              className={[
                "relative flex items-center gap-3 rounded-lg px-2 py-2 md:px-3 text-sm font-medium transition",
                collapsed ? "md:justify-center md:px-2" : "",
                active
                  ? "bg-white/10 text-white before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-strawberry"
                  : "text-white/55 hover:bg-white/5 hover:text-white",
              ].join(" ")}
            >
              {item.icon}
              <span className={collapsed ? "hidden" : "hidden md:inline"}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-0.5 md:mt-auto md:flex-col md:items-stretch md:gap-3 md:border-t md:border-white/10 md:px-2 md:pt-4">
        {email && (
          <span
            className={[
              "hidden truncate text-xs text-white/40",
              collapsed ? "" : "md:block",
            ].join(" ")}
          >
            {email}
          </span>
        )}
        {plan && (
          <span
            className={[
              "hidden text-xs text-white/60",
              collapsed ? "" : "md:block",
            ].join(" ")}
          >
            {plan.kind === "free" ? formatFreePlanUsage(plan) : "Sundae subscriber"}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.removeItem("sundae:tutorial:dismissed");
              localStorage.setItem("sundae:tutorial:force", "1");
              // Full-page nav (not router.push) so the tutorial hook's
              // mount effect re-initializes with the force key set.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.assign("/weekly-session");
            } catch {
              // localStorage blocked -- no-op.
            }
          }}
          title="Replay tutorial"
          className={[
            "flex items-center gap-3 rounded-lg px-2 py-2 md:px-3 text-left text-sm font-medium text-white/55 transition hover:bg-white/5 hover:text-white",
            collapsed ? "md:justify-center md:px-2" : "",
          ].join(" ")}
        >
          <span className={collapsed ? "" : "md:hidden"}>{TUTORIAL_ICON}</span>
          <span className={collapsed ? "hidden" : "hidden md:inline"}>Replay tutorial</span>
          <span className="sr-only md:hidden">Replay tutorial</span>
        </button>
        {plan?.kind === "free" ? (
          <Link
            href="/subscribe?reason=limit"
            title="Upgrade"
            className={[
              "flex items-center gap-3 rounded-lg px-2 py-2 md:px-3 text-left text-sm font-medium text-strawberry transition hover:bg-white/5",
              collapsed ? "md:justify-center md:px-2" : "",
            ].join(" ")}
          >
            <span className={collapsed ? "" : "md:hidden"}>{BILLING_ICON}</span>
            <span className={collapsed ? "hidden" : "hidden md:inline"}>Upgrade</span>
            <span className="sr-only md:hidden">Upgrade</span>
          </Link>
        ) : (
          <>
            {portalError && (
              <span className={collapsed ? "sr-only" : "text-xs text-red-600"}>{portalError}</span>
            )}
            <button
              type="button"
              onClick={() => void openPortal()}
              disabled={portalLoading}
              title="Manage subscription"
              className={[
                "flex items-center gap-3 rounded-lg px-2 py-2 md:px-3 text-left text-sm font-medium text-white/55 transition hover:bg-white/5 hover:text-white disabled:opacity-60",
                collapsed ? "md:justify-center md:px-2" : "",
              ].join(" ")}
            >
              <span className={collapsed ? "" : "md:hidden"}>{BILLING_ICON}</span>
              <span className={collapsed ? "hidden" : "hidden md:inline"}>
                {portalLoading ? "Opening…" : "Manage subscription"}
              </span>
              <span className="sr-only md:hidden">{portalLoading ? "Opening…" : "Manage subscription"}</span>
            </button>
          </>
        )}
        <button
          onClick={signOut}
          title={collapsed ? `Sign out${email ? ` (${email})` : ""}` : undefined}
          className={[
            "flex items-center gap-3 rounded-lg px-2 py-2 md:px-3 text-left text-sm font-medium text-white/55 transition hover:bg-white/5 hover:text-white",
            collapsed ? "md:justify-center md:px-2" : "",
          ].join(" ")}
        >
          <span className={collapsed ? "" : "md:hidden"}>{SIGN_OUT_ICON}</span>
          <span className={collapsed ? "hidden" : "hidden md:inline"}>Sign out</span>
          <span className="sr-only md:hidden">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
