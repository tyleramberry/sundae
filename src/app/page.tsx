import GoogleSignInButton from "@/components/GoogleSignInButton";
import AgentDemo from "@/components/AgentDemo";
import RoleMarquee from "@/components/RoleMarquee";
import WeekAssembly from "@/components/WeekAssembly";
import StickyCta from "@/components/StickyCta";
import Drip from "@/components/Drip";
import MeltWord from "@/components/MeltWord";
import Reveal from "@/components/Reveal";
import { FREE_SESSION_LIMIT } from "@/lib/weeklySession/freeTier";

// Marketing landing page -- the ad destination. Explains the product and
// hands off straight into Google OAuth (every button on the page launches
// the same sign-in). After login, /auth/callback routes new users into
// onboarding; returning users skip it.
//
// Design rules for this page, so additions stay in keeping:
//   - Type does the work. Headlines are `.display` (heavy, condensed);
//     one word per headline may `.melt`. No eyebrow pills, no icon tiles.
//   - No boxed cards. Content is separated by hairlines and whitespace.
//     The only "cards" are the two product demos, which are pictures of
//     the product, not layout.
//   - Two surfaces: canvas and night. Strawberry is the single accent.
//     Sections meet with a Drip, not a border.
//   - No testimonials, user counts, or press logos unless they're real.
//
// This page stays a server component. The interactive pieces (AgentDemo,
// WeekAssembly, StickyCta, Reveal) are client islands.

// One constant each so the hero, pricing, FAQ, and sticky bar can't drift
// apart (they had: the page used to say "2 free sessions" in one place and
// "3" in another). The free-session count is read from the same constant
// the paywall enforces.
const MONTHLY_PRICE = "$7.99";
const FREE_SESSIONS = FREE_SESSION_LIMIT;

// Where the drips hang off each melting word: letter index -> offset and
// length in em (see MeltWord.tsx).
const HERO_DRIPS = {
  0: { x: 0.1, len: 0.34 },
  2: { x: 0.07, len: 0.2 },
  4: { x: 0.36, len: 0.46 },
};
const CLOSING_DRIPS = {
  0: { x: 0.1, len: 0.3 },
  3: { x: 0.2, len: 0.42 },
};

const CTA_ON_LIGHT =
  "inline-flex items-center justify-center gap-3 rounded-full bg-ink py-2.5 pl-2.5 pr-7 text-base font-semibold text-white transition hover:-translate-y-0.5 hover:bg-black active:translate-y-0 disabled:opacity-60";
const CTA_ON_DARK =
  "inline-flex items-center justify-center gap-3 rounded-full bg-strawberry py-2.5 pl-2.5 pr-7 text-base font-semibold text-night transition hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 disabled:opacity-60";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-canvas font-sans text-ink">
      {/* Reveal.tsx starts every `.reveal` element hidden and un-hides it
          once it's on screen. Without JS that never runs, so this forces
          the visible state -- a JS failure gives a static page, not a
          blank one. */}
      <noscript>
        <style>{`.reveal { opacity: 1 !important; transform: none !important; }`}</style>
      </noscript>

      <header>
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-10">
          {/* The wordmark melts on hover. The header itself scrolls away
              with the page: a pinned light bar would sit on top of the
              dark sections, and phones get the sticky CTA bar instead. */}
          <a
            href="#top"
            className="melt melt-hover text-xl leading-none text-ink sm:text-2xl"
          >
            Sundae
          </a>

          <div className="flex items-center gap-7">
            <nav
              aria-label="Page sections"
              className="hidden items-center gap-7 text-sm font-medium text-ink-secondary md:flex"
            >
              <a href="#how" className="transition hover:text-ink">
                How it works
              </a>
              <a href="#pricing" className="transition hover:text-ink">
                Pricing
              </a>
              <a href="#faq" className="transition hover:text-ink">
                Questions
              </a>
            </nav>
            {/* The quiet, returning-user entry point. "Sign in", not "Get
                started", so a first-time visitor's eye goes to the hero
                button. Both fire the same OAuth. */}
            <GoogleSignInButton
              label="Sign in"
              className="inline-flex items-center gap-2 rounded-full border border-ink/15 py-1 pl-1 pr-4 text-sm font-medium text-ink transition hover:border-ink/40 disabled:opacity-60"
            />
          </div>
        </div>
      </header>

      <main id="top" className="flex flex-1 flex-col">
        {/* ---------------------------------------------------------------
            Hero. The headline runs the full width on its own; the pitch
            and the session demo sit underneath it. */}
        <section className="mx-auto w-full max-w-7xl px-5 pb-24 pt-8 sm:px-10 sm:pb-32 sm:pt-14">
          <Reveal>
            <h1 className="display text-[clamp(3.25rem,10.5vw,9.5rem)]">
              Plan the week
              <br />
              before it{" "}
              <MeltWord
                text="melts."
                drips={HERO_DRIPS}
                className="text-[0.78em] text-strawberry"
              />
            </h1>
          </Reveal>

          <div className="mt-10 grid grid-cols-[minmax(0,1fr)] items-start gap-12 sm:mt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-20">
            <div className="flex min-w-0 max-w-xl flex-col gap-7">
              <Reveal delay={80}>
                <p className="text-xl leading-8 text-ink sm:text-2xl sm:leading-9">
                  Sundae turns the roles you play into real time on your
                  Google Calendar. One guided session, about ten minutes,
                  and the whole week is set.
                </p>
              </Reveal>

              <Reveal delay={150}>
                <div data-cta className="flex flex-wrap items-center gap-x-5 gap-y-3">
                  <GoogleSignInButton
                    label="Plan my week free"
                    className={CTA_ON_LIGHT}
                  />
                  <p className="text-sm text-ink-secondary">
                    {FREE_SESSIONS} sessions free. No card.
                  </p>
                </div>
              </Reveal>

              {/* Pre-empts Google's consent screen, which is the very next
                  thing the button shows and the scariest-sounding screen
                  in the funnel. */}
              <Reveal delay={210}>
                <p className="max-w-md border-l-2 border-strawberry pl-4 text-sm leading-6 text-ink-secondary">
                  Google will ask to connect your calendar so Sundae can
                  find your open time. Nothing is added until you say yes.
                </p>
              </Reveal>

              <Reveal delay={260} className="min-w-0 pt-2">
                <RoleMarquee />
              </Reveal>
            </div>

            <Reveal delay={200} scale className="flex justify-center lg:justify-end">
              <div className="float-soft w-full max-w-md">
                <AgentDemo />
              </div>
            </Reveal>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            The scroll-built week -- the page's centerpiece. Dark, so the
            role colors carry it. Owns its own drips top and bottom. */}
        <div id="how">
          <WeekAssembly />
        </div>

        {/* ---------------------------------------------------------------
            What makes it different. Rows, not cards. */}
        <section className="mx-auto w-full max-w-7xl px-5 pb-20 pt-32 sm:px-10 sm:pb-28 sm:pt-44">
          <Reveal>
            <h2 className="display max-w-4xl text-5xl sm:text-7xl">
              Not another
              <br />
              to-do list.
            </h2>
          </Reveal>
          <ol className="mt-12 border-b border-ink/15 sm:mt-16">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 80}>
                <li className="group grid gap-x-10 gap-y-3 border-t border-ink/15 py-8 sm:py-10 md:grid-cols-[4rem_minmax(0,5fr)_minmax(0,6fr)] md:items-baseline">
                  <span className="font-mono text-sm text-ink-secondary transition-colors group-hover:text-strawberry">
                    0{i + 1}
                  </span>
                  <h3 className="display text-3xl transition-transform duration-300 group-hover:translate-x-1 sm:text-4xl">
                    {f.title}
                  </h3>
                  <p className="max-w-lg text-lg leading-8 text-ink-secondary">
                    {f.body}
                  </p>
                </li>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* ---------------------------------------------------------------
            Trust. Its own section because the calendar permission is the
            single biggest thing a cold visitor hesitates on. The Privacy
            Policy link here (and in the footer) also has to stay reachable
            from the homepage for Google's OAuth verification. */}
        <section className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-10 sm:py-28">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
            <Reveal>
              <h2 className="display text-5xl sm:text-7xl">
                It proposes.
                <br />
                You confirm.
              </h2>
              <p className="mt-6 max-w-sm text-lg leading-8 text-ink-secondary">
                Connecting a calendar is a real ask. Here is exactly what
                Sundae does with yours. Full detail in the{" "}
                <a
                  href="/privacy"
                  className="text-ink underline decoration-strawberry decoration-2 underline-offset-4"
                >
                  Privacy Policy
                </a>
                .
              </p>
            </Reveal>

            {/* One ruled grid: the hairlines are the cells' own borders,
                shared, rather than four separate boxes. */}
            <Reveal delay={100}>
              <ul className="grid border-l border-t border-ink/15 sm:grid-cols-2">
                {CALENDAR_PROMISES.map((p) => (
                  <li
                    key={p.title}
                    className="flex flex-col gap-2 border-b border-r border-ink/15 p-6 sm:p-8"
                  >
                    <h3 className="text-lg font-semibold leading-snug tracking-normal">
                      {p.title}
                    </h3>
                    <p className="text-base leading-7 text-ink-secondary">
                      {p.body}
                    </p>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            Pricing. Two numbers, set large. */}
        <section
          id="pricing"
          className="mx-auto w-full max-w-7xl scroll-mt-20 px-5 py-20 sm:px-10 sm:py-28"
        >
          <Reveal>
            <div className="grid border-y border-ink/15 md:grid-cols-2">
              <div className="flex flex-col gap-3 py-10 md:pr-12">
                <p className="font-mono text-sm text-ink-secondary">To start</p>
                <p className="display text-7xl sm:text-8xl">Free</p>
                <p className="max-w-sm text-lg leading-8 text-ink-secondary">
                  Your first {FREE_SESSIONS} weekly planning sessions. No
                  credit card.
                </p>
              </div>
              <div className="flex flex-col gap-3 border-t border-ink/15 py-10 md:border-l md:border-t-0 md:pl-12">
                <p className="font-mono text-sm text-ink-secondary">
                  If you keep going
                </p>
                <p className="display text-7xl sm:text-8xl">
                  {MONTHLY_PRICE}
                  <span className="font-sans text-xl font-normal tracking-normal text-ink-secondary">
                    {" "}
                    / month
                  </span>
                </p>
                <p className="max-w-sm text-lg leading-8 text-ink-secondary">
                  Unlimited sessions. Your roles and history carry over.
                  Cancel anytime from Settings.
                </p>
              </div>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div data-cta className="mt-10">
              <GoogleSignInButton
                label="Start my free sessions"
                className={CTA_ON_LIGHT}
              />
            </div>
          </Reveal>
        </section>

        {/* ---------------------------------------------------------------
            FAQ. Native <details>, so it works with no JS and is keyboard
            and screen-reader operable for free. */}
        <section
          id="faq"
          className="mx-auto w-full max-w-7xl scroll-mt-20 px-5 pb-28 pt-20 sm:px-10 sm:pb-40 sm:pt-28"
        >
          <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
            <Reveal>
              <h2 className="display text-5xl sm:text-7xl">
                Fair
                <br />
                questions.
              </h2>
            </Reveal>
            <Reveal delay={80}>
              <div className="border-b border-ink/15">
                {FAQS.map((item, i) => (
                  <details
                    key={item.q}
                    open={i === 0}
                    className="faq-item border-t border-ink/15"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-lg font-semibold sm:text-xl">
                      {item.q}
                      <span
                        aria-hidden
                        className="faq-plus shrink-0 text-2xl font-light leading-none text-strawberry transition-transform duration-200"
                      >
                        +
                      </span>
                    </summary>
                    <p className="max-w-2xl pb-7 text-lg leading-8 text-ink-secondary">
                      {item.a}
                    </p>
                  </details>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            Closing CTA. The page drips into it, and it drips into the
            footer. */}
        <section className="relative bg-night px-5 pb-24 pt-32 text-white sm:px-10 sm:pb-32 sm:pt-44">
          <Drip className="absolute inset-x-0 top-0 text-canvas" />
          <Reveal>
            <div className="mx-auto flex w-full max-w-[75rem] flex-col gap-10">
              <h2 className="display text-[clamp(3rem,9vw,8rem)]">
                Sunday&rsquo;s coming.
                <br />
                Don&rsquo;t let it{" "}
                <MeltWord
                  text="melt."
                  drips={CLOSING_DRIPS}
                  className="text-[0.78em] text-strawberry"
                />
              </h2>
              <div data-cta className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <GoogleSignInButton
                  label="Plan my week free"
                  className={CTA_ON_DARK}
                />
                <p className="text-sm text-white/60">
                  {FREE_SESSIONS} sessions free, then {MONTHLY_PRICE}/month.
                  Cancel anytime.
                </p>
              </div>
            </div>
          </Reveal>
          <Drip className="absolute inset-x-0 top-full text-night" />
        </section>
      </main>

      {/* Bottom padding on phones leaves room for the sticky CTA bar. */}
      <footer className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-5 pb-24 pt-24 text-sm text-ink-secondary sm:flex-row sm:items-center sm:gap-8 sm:px-10 md:pb-12">
        <span className="melt text-base text-ink">Sundae</span>
        <span>© {new Date().getFullYear()}</span>
        <a href="/privacy" className="underline underline-offset-4 hover:text-ink sm:ml-auto">
          Privacy Policy
        </a>
        <a href="/terms" className="underline underline-offset-4 hover:text-ink">
          Terms of Service
        </a>
      </footer>

      <StickyCta note={`${FREE_SESSIONS} sessions free. No card.`} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Copy

const FEATURES = [
  {
    title: "Plans around your roles",
    body: "Parent, founder, athlete, friend. Your week gets organized by who you’re showing up for, so work stops winning by default.",
  },
  {
    title: "Turns goals into blocks",
    body: "“Work out every morning” becomes seven real blocks, fitted into the open time on your actual calendar.",
  },
  {
    title: "Follows up all week",
    body: "A daily nudge to tick off what got done, and a scorecard per role you review at your next session.",
  },
];

const CALENDAR_PROMISES = [
  {
    title: "It reads your open time",
    body: "That’s how it knows where a block can actually go.",
  },
  {
    title: "It never writes on its own",
    body: "Sundae proposes a week. Nothing is created until you confirm.",
  },
  {
    title: "You can change any block",
    body: "Edit the time or drop it before anything is added.",
  },
  {
    title: "Delete a block, it notices",
    body: "Remove something later and your scorecard updates to match.",
  },
];

const FAQS = [
  {
    q: "Do I need a credit card to start?",
    a: `No. Your first ${FREE_SESSIONS} weekly planning sessions are free with no card. To keep planning after that, Sundae is ${MONTHLY_PRICE}/month, and you can cancel anytime from Settings.`,
  },
  {
    q: "Will it put things on my calendar without asking?",
    a: "No. Sundae proposes blocks and waits. Nothing is written until you confirm, and you can change the time or drop a block first.",
  },
  {
    q: "How long does a session take?",
    a: "About ten minutes, once a week. The first one runs a little longer because you’re setting up your roles.",
  },
  {
    q: "What does the AI actually do?",
    a: "It runs the planning conversation: it asks about each role, works out how many blocks a goal needs, and proposes times in your open gaps. Every final call is yours.",
  },
  {
    q: "Which calendars does it work with?",
    a: "Google Calendar. Apple Calendar and Outlook aren’t supported yet.",
  },
  {
    q: "What if my week falls apart?",
    a: "That’s the normal case. Each week starts a fresh scorecard, and anything unfinished gets picked back up at your next session. Nothing carries a penalty forward.",
  },
];
