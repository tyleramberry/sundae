import Link from "next/link";

const TOOLS = [
  {
    href: "/debug/weekly-session",
    title: "Weekly Session Sandbox",
    description:
      "Run the weekly planning engine with custom roles, optional fake last week, full vs addendum mode, and token usage.",
  },
  {
    href: "/debug/engine",
    title: "Onboarding Engine Sandbox",
    description:
      "Step through the raw onboarding conversation engine without touching saved onboarding answers.",
  },
  {
    href: "/debug/screens?s=onboarding",
    title: "Onboarding Screen Preview",
    description: "Preview the full survey, live demo, and hype onboarding flow.",
  },
  {
    href: "/debug/screens?s=subscribe",
    title: "Subscribe Screen Previews",
    description: "Preview the upgrade and paywall states without leaving your test account.",
    sublinks: [
      { href: "/debug/screens?s=subscribe", label: "Subscribe" },
      { href: "/debug/screens?s=limit", label: "Free limit reached" },
      { href: "/debug/screens?s=resubscribe", label: "Resubscribe" },
      { href: "/debug/screens?s=canceled", label: "Checkout canceled" },
      { href: "/debug/screens?s=confirming", label: "Confirming" },
    ],
  },
  {
    href: "/debug/trend",
    title: "6-Week Trend Chart Demo",
    description: "Preview the role KPI trend chart with realistic multi-week sample data.",
  },
  {
    href: "/debug/email",
    title: "Email Preview & Debug",
    description: "Inspect and test daily follow-up and session-recap emails against your real data.",
  },
  {
    href: "/debug/calendar",
    title: "Calendar Inspector",
    description: "View this week's Google Calendar events and create a test event.",
  },
];

export default function DebugHubPage() {
  return (
    <div className="min-h-dvh bg-zinc-50 px-6 py-12 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Test Account Tools
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Demo &amp; Debug Hub</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Unlimited free sessions active. Pick any sandbox or screen preview below.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/weekly-session"
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Weekly session
            </Link>
            <Link
              href="/dashboard"
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Back to dashboard
            </Link>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {TOOLS.map((tool) => (
            <div
              key={tool.href}
              className="flex flex-col justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div>
                <Link
                  href={tool.href}
                  className="text-base font-semibold hover:underline underline-offset-4"
                >
                  {tool.title}
                </Link>
                <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                  {tool.description}
                </p>
              </div>
              {tool.sublinks && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {tool.sublinks.map((sub) => (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      {sub.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
