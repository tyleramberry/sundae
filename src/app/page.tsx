import GoogleSignInButton from "@/components/GoogleSignInButton";
import AgentDemo from "@/components/AgentDemo";
import RoleMarquee from "@/components/RoleMarquee";
import WeekAssembly from "@/components/WeekAssembly";
import Reveal from "@/components/Reveal";

// Marketing landing page -- the ad destination. Explains the product and
// hands off straight into Google OAuth (top nav + hero + closing CTA all
// launch the same sign-in). After login, /auth/callback routes new users
// into onboarding and returning users into the app.
//
// Structure note: this page scrolls. It used to be a single centered
// viewport-height column, which was invisible on the page's own terms --
// <body> carried `overflow-hidden` for the signed-in shell's benefit, so
// everything past the fold (the feature cards, the footer's Privacy/Terms
// links) was unreachable on every laptop and most phones. That cap now
// lives in src/app/(app)/layout.tsx; see the comment in src/app/layout.tsx.
//
// Motion note: the scroll reveals (Reveal), the scroll-scrubbed week build
// (WeekAssembly), and the looping agent demo (AgentDemo) are all client
// components, but this page itself stays a server component -- nothing
// here needs to be a client boundary, so the interactive pieces are
// islands, not the whole page.

// Not yet set -- Stripe Checkout isn't wired up until later in the build
// (docs/30-Day-Calendar.md), and no price has been decided. Leaving this
// null keeps the page honest: it states the trial terms it can actually
// stand behind and stays silent on the number. Set it and the price shows
// up in the hero microcopy, the pricing line, and the FAQ at once.
const MONTHLY_PRICE: string | null = null;

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      {/* Reveal.tsx starts every `.reveal` element hidden and un-hides it
          from an effect once IntersectionObserver confirms it's on screen.
          Without JS that effect never runs, so this forces the visible
          state back on -- a visitor with JS off (or a hydration failure)
          gets a static page instead of permanently-invisible content. */}
      <noscript>
        <style>{`.reveal { opacity: 1 !important; transform: none !important; }`}</style>
      </noscript>

      <header className="sticky top-0 z-20 flex w-full items-center justify-between border-b border-transparent px-6 py-5 backdrop-blur-md sm:px-10">
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-black dark:text-zinc-50">
          Sundae
        </span>
        {/* Deliberately the quiet, returning-user entry point -- "Sign in",
            not "Sign in with Google", so it doesn't read as the thing a
            first-time visitor is supposed to click. The hero's "Get started
            free" is the primary path; both fire the same OAuth. */}
        <GoogleSignInButton
          label="Sign in"
          className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white/70 px-4 py-2 text-sm font-medium text-zinc-800 backdrop-blur transition hover:border-zinc-400 hover:bg-white dark:border-zinc-700 dark:bg-black/50 dark:text-zinc-200 dark:hover:bg-zinc-900"
        />
      </header>

      <main className="flex flex-1 flex-col">
        {/* ---------------------------------------------------------------
            Hero */}
        <section className="relative overflow-hidden">
          {/* Ambient drifting glow, purely decorative. Sits below
              everything else in the hero and is inert to pointer events so
              it can never intercept a click meant for the CTA. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
          >
            {/* Calm-identity retheme (spec #3): removed the aurora/violet
                gradient wash. PRD calls for no background gradients or
                decorative SVGs not tied to data. Kept the empty divs out
                entirely rather than transparent-ing them so the DOM
                actually shrinks with the visual. */}
          </div>

          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-12 px-6 pb-10 pt-10 sm:px-10 sm:pt-16 lg:flex-row lg:items-center lg:gap-16 lg:pb-16">
            <div className="flex min-w-0 w-full max-w-xl flex-col items-center gap-6 text-center lg:items-start lg:text-left">
              {/* Plain uppercase eyebrow, matching the same label style
                  WeekAssembly's "One sitting a week" uses -- no pill, no
                  dot. Consistent with the rest of the page's restrained,
                  designed-system look rather than the rounded-badge-with-
                  status-dot pattern that reads as generic AI-product
                  chrome. */}
              <Reveal>
                <span className="text-sm font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                  AI-guided weekly planning
                </span>
              </Reveal>
              <Reveal delay={70}>
                <h1 className="text-4xl font-semibold leading-tight tracking-tight text-black dark:text-zinc-50 sm:text-5xl">
                  Set the vision.{" "}
                  {/* Calm-identity retheme: gradient text swapped for a
                      solid accent-hover for readable, on-palette emphasis. */}
                  <span className="text-emerald-700 dark:text-emerald-400">
                    Sundae handles the busywork.
                  </span>
                </h1>
              </Reveal>
              <Reveal delay={140}>
                <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
                  Every AI planner answers &ldquo;when.&rdquo; Sundae asks
                  &ldquo;who for.&rdquo; Define the roles you actually play —
                  founder, parent, athlete — and one short guided session
                  turns them into a real week on your calendar.
                </p>
              </Reveal>

              <Reveal delay={210}>
                <div className="flex flex-col items-center gap-3 lg:items-start">
                  <GoogleSignInButton label="Get started free" />
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    7-day free trial. Cancel anytime from Settings — no hoops.
                  </span>
                  {/* Pre-empts Google's consent screen, which is the very
                      next thing this button shows and is the scariest-
                      sounding screen in the funnel. Saying what we ask for
                      and why, before it appears, costs one line here. */}
                  <span className="max-w-sm text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    Google will ask Sundae to connect to your calendar — that&apos;s
                    how it finds your open time. Nothing is ever added or
                    changed without you confirming it first.
                  </span>
                </div>
              </Reveal>

              <Reveal delay={270} className="w-full max-w-sm pt-2 lg:max-w-none">
                <RoleMarquee />
              </Reveal>
            </div>

            <div className="flex w-full justify-center lg:justify-end">
              <Reveal delay={260} scale>
                <div className="float-soft">
                  <AgentDemo />
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            Scroll-scrubbed week assembly -- the page's centerpiece. Its
            own component (src/components/WeekAssembly.tsx) since it owns
            a scroll listener and a tall pinned layout, not something to
            inline here. */}
        <WeekAssembly />

        {/* ---------------------------------------------------------------
            What makes it different */}
        <section className="px-6 py-16 sm:px-10 sm:py-24">
          <div className="mx-auto flex max-w-5xl flex-col gap-10">
            <Reveal>
              <h2 className="text-center text-2xl font-semibold tracking-tight text-black dark:text-zinc-50 sm:text-3xl">
                Not another to-do list
              </h2>
            </Reveal>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={i * 90} scale>
                  <li className="group h-full rounded-xl border border-zinc-200 bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:border-zinc-300 hover:shadow-lg hover:shadow-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:shadow-black/20">
                    <span
                      aria-hidden
                      className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 transition-colors group-hover:bg-emerald-100 group-hover:text-emerald-700 dark:bg-zinc-900 dark:text-zinc-300 dark:group-hover:bg-emerald-950/60 dark:group-hover:text-emerald-400"
                    >
                      <f.Icon className="h-[18px] w-[18px]" />
                    </span>
                    <h3 className="text-sm font-semibold text-black dark:text-zinc-50">
                      {f.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                      {f.body}
                    </p>
                  </li>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            Permissions / trust. Its own section because the calendar scope
            is the single biggest thing a cold visitor hesitates on. */}
        <section className="border-y border-zinc-200 bg-white px-6 py-16 dark:border-zinc-900 dark:bg-zinc-950 sm:px-10 sm:py-20">
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            <Reveal>
              <h2 className="text-center text-2xl font-semibold tracking-tight text-black dark:text-zinc-50 sm:text-3xl">
                What Sundae does with your calendar
              </h2>
            </Reveal>
            <Reveal delay={80}>
              <ul className="flex flex-col gap-4">
                {CALENDAR_PROMISES.map((p) => (
                  <li key={p} className="flex gap-3">
                    <span
                      aria-hidden
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                    />
                    <span className="text-base leading-7 text-zinc-700 dark:text-zinc-300">
                      {p}
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={140}>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Full detail in our{" "}
                <a
                  href="/privacy"
                  className="underline hover:text-zinc-950 dark:hover:text-zinc-50"
                >
                  Privacy Policy
                </a>
                .
              </p>
            </Reveal>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            FAQ */}
        <section className="px-6 py-16 sm:px-10 sm:py-24">
          <div className="mx-auto flex max-w-3xl flex-col gap-8">
            <Reveal>
              <h2 className="text-center text-2xl font-semibold tracking-tight text-black dark:text-zinc-50 sm:text-3xl">
                Questions
              </h2>
            </Reveal>
            <dl className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
              {faqs(MONTHLY_PRICE).map((item, i) => (
                <Reveal key={item.q} delay={i * 60}>
                  <div className="flex flex-col gap-2 py-5 first:pt-0">
                    <dt className="text-base font-semibold text-black dark:text-zinc-50">
                      {item.q}
                    </dt>
                    <dd className="text-sm leading-7 text-zinc-600 dark:text-zinc-400">
                      {item.a}
                    </dd>
                  </div>
                </Reveal>
              ))}
            </dl>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            Closing CTA */}
        <section className="relative overflow-hidden border-t border-zinc-200 bg-white px-6 py-16 text-center dark:border-zinc-900 dark:bg-zinc-950 sm:px-10 sm:py-28">
          {/* Calm-identity retheme (spec #3): removed the aurora backdrop
              behind the closing CTA. Same reasoning as the hero aurora
              above -- no background gradients not tied to data. */}
          <Reveal scale>
            <div className="mx-auto flex max-w-xl flex-col items-center gap-6">
              <h2 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
                Plan next week in one sitting.
              </h2>
              <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
                Your first session takes about ten minutes and ends with a
                week already on your calendar.
              </p>
              <div className="flex flex-col items-center gap-3">
                <GoogleSignInButton label="Get started free" />
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {MONTHLY_PRICE
                    ? `Free for 7 days, then ${MONTHLY_PRICE}/month · cancel anytime`
                    : "Free for 7 days · cancel anytime"}
                </span>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="flex flex-col items-center gap-3 px-6 py-10 text-sm text-zinc-500 dark:text-zinc-400 sm:flex-row sm:justify-center sm:gap-6">
        <span>© {new Date().getFullYear()} Sundae</span>
        <a
          href="/privacy"
          className="underline hover:text-zinc-950 dark:hover:text-zinc-50"
        >
          Privacy Policy
        </a>
        <a
          href="/terms"
          className="underline hover:text-zinc-950 dark:hover:text-zinc-50"
        >
          Terms of Service
        </a>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feature card icons -- plain stroke-based SVGs (24x24, currentColor) in
// the same hand-rolled style as GoogleSignInButton's logo, rather than an
// icon library dependency for three glyphs. Swapped in for the emoji this
// section originally shipped with, which read as placeholder/AI-generated
// rather than a deliberate icon choice.

function RolesIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 3.5 21 8l-9 4.5L3 8Z" />
      <path d="M3 12.5 12 17l9-4.5" />
      <path d="M3 17 12 21.5 21 17" />
    </svg>
  );
}

function BlocksIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M3.5 10h17" />
      <path d="M8 3v4M16 3v4" />
      <path d="m8.5 14.5 2 2 4-4.2" />
    </svg>
  );
}

function FollowUpIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4.5 12a7.5 7.5 0 0 1 12.6-5.5L20 9" />
      <path d="M20 5v4h-4" />
      <path d="M19.5 12a7.5 7.5 0 0 1-12.6 5.5L4 15" />
      <path d="M4 19v-4h4" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Copy

const FEATURES = [
  {
    Icon: RolesIcon,
    title: "Plans around your roles",
    body: "Not a flat to-do list — your week, organized by who you're showing up for.",
  },
  {
    Icon: BlocksIcon,
    title: "Turns goals into blocks",
    body: "“Work out every morning” becomes a real, done-for-you calendar plan.",
  },
  {
    Icon: FollowUpIcon,
    title: "Follows up all week",
    body: "A daily nudge to log what got done, and a per-role scorecard you review at your next session.",
  },
];

const CALENDAR_PROMISES = [
  "It reads your calendar to find open time — that's how it knows where a block can actually go.",
  "It proposes; you confirm. Sundae never writes an event on its own.",
  "You can edit or reject any proposed time before it's created.",
  "Delete a block later and Sundae notices, so your scorecard stays honest.",
];

function faqs(price: string | null) {
  return [
    {
      q: "Do I need a credit card to start?",
      a: price
        ? `Yes. The 7-day trial is card-backed — you won't be charged until day 7, and the first charge is ${price}/month. Cancel any time before then and you pay nothing.`
        : "Yes. The 7-day trial is card-backed — you won't be charged until day 7, and you can cancel any time before then and pay nothing.",
    },
    {
      q: "Which calendars does it work with?",
      a: "Google Calendar. Apple Calendar and Outlook aren't supported yet.",
    },
    {
      q: "Will it put things on my calendar without asking?",
      a: "No. Sundae proposes blocks and waits. Nothing is written until you confirm, and you can change the time or drop the block first.",
    },
    {
      q: "How long does a session take?",
      a: "About ten minutes, once a week. The first one runs a little longer because you're setting up your roles.",
    },
    {
      q: "What if my week falls apart?",
      a: "That's the normal case. Each week starts a fresh scorecard, and anything unfinished simply gets picked back up at your next session — nothing carries a penalty forward.",
    },
  ];
}
