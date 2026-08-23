"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// The persistent app shell nav (built for the Day 11 UI/UX polish pass).
// One clean rail on desktop, a top bar on mobile. Active state is driven by
// the pathname, not hand-passed props, so it stays correct on any nav path
// (sidebar click, deep link, browser back). Auth is enforced server-side in
// the (app) layout -- this component only needs the email to display and a
// sign-out control.
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

export default function AppSidebar({ email }: { email: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

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
        "flex shrink-0 flex-row items-center justify-between gap-2 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950 md:h-full md:flex-col md:items-stretch md:justify-start md:gap-1 md:border-b-0 md:border-r md:py-8 md:transition-[width] md:duration-150",
        collapsed ? "md:w-[68px] md:px-2" : "md:w-60 md:px-4",
      ].join(" ")}
    >
      <Link
        href="/dashboard"
        title="Sundae"
        className={[
          "text-sm font-semibold uppercase tracking-[0.2em] text-black dark:text-zinc-50 md:mb-6",
          collapsed ? "md:px-0 md:text-center" : "md:px-2",
        ].join(" ")}
      >
        <span className={collapsed ? "md:hidden" : ""}>Sundae</span>
        <span className={collapsed ? "hidden md:inline" : "hidden"}>S</span>
      </Link>

      <nav className="flex flex-row gap-1 md:flex-1 md:flex-col">
        {NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              className={[
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                collapsed ? "md:justify-center md:px-2" : "",
                active
                  ? "bg-zinc-100 text-black dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100",
              ].join(" ")}
            >
              {item.icon}
              <span className={collapsed ? "hidden" : "hidden md:inline"}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-2 md:mt-auto md:flex-col md:items-stretch md:gap-3 md:border-t md:border-zinc-100 md:px-2 md:pt-4 md:dark:border-zinc-900">
        {email && (
          <span
            className={[
              "hidden truncate text-xs text-zinc-400 dark:text-zinc-500",
              collapsed ? "" : "md:block",
            ].join(" ")}
          >
            {email}
          </span>
        )}
        <button
          onClick={signOut}
          title={collapsed ? `Sign out${email ? ` (${email})` : ""}` : undefined}
          className={[
            "flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100",
            collapsed ? "md:justify-center md:px-2" : "",
          ].join(" ")}
        >
          <span className={collapsed ? "hidden md:inline" : "hidden"}>{SIGN_OUT_ICON}</span>
          <span className={collapsed ? "hidden" : "hidden md:inline"}>Sign out</span>
          <span className="md:hidden">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
