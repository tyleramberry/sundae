import GoogleSignInButton from "@/components/GoogleSignInButton";

// Marketing landing page -- the ad destination. Explains the product and
// hands off straight into Google OAuth (top nav + hero + closing CTA all
// launch the same sign-in). After login, /auth/callback routes new users
// into onboarding and returning users into the app.
export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <header className="flex w-full items-center justify-between px-6 py-5 sm:px-10">
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-black dark:text-zinc-50">
          Sundae
        </span>
        <GoogleSignInButton className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:border-zinc-400 hover:bg-white dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900" />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-20 text-center sm:px-16">
        <span className="text-sm font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          AI-guided weekly planning
        </span>
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-black dark:text-zinc-50 sm:text-5xl">
          Set the vision. Sundae handles the busywork.
        </h1>
        <p className="max-w-lg text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Every AI planner answers &ldquo;when.&rdquo; Sundae asks &ldquo;who
          for.&rdquo; Define the roles you actually play — founder, parent,
          athlete — and Sundae runs a short guided session each week, surfaces
          what matters most, and proposes calendar blocks on your Google
          Calendar. Nothing gets scheduled until you confirm it.
        </p>

        <div className="flex flex-col items-center gap-3">
          <GoogleSignInButton label="Get started free" />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            7-day free trial · cancel anytime
          </span>
        </div>

        <ul className="mt-6 grid max-w-2xl grid-cols-1 gap-4 text-left sm:grid-cols-3">
          {[
            {
              title: "Plans around your roles",
              body: "Not a flat to-do list — your week, organized by who you're showing up for.",
            },
            {
              title: "Turns goals into blocks",
              body: "“Work out every morning” becomes a real, done-for-you calendar plan.",
            },
            {
              title: "Never acts without asking",
              body: "Sundae proposes; you confirm. It never touches your calendar on its own.",
            },
          ].map((f) => (
            <li
              key={f.title}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <h3 className="text-sm font-semibold text-black dark:text-zinc-50">
                {f.title}
              </h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {f.body}
              </p>
            </li>
          ))}
        </ul>
      </main>

      <footer className="flex flex-col items-center gap-3 px-6 py-8 text-sm text-zinc-500 dark:text-zinc-400 sm:flex-row sm:justify-center sm:gap-6">
        <a href="/privacy" className="underline hover:text-zinc-950 dark:hover:text-zinc-50">
          Privacy Policy
        </a>
        <a href="/terms" className="underline hover:text-zinc-950 dark:hover:text-zinc-50">
          Terms of Service
        </a>
      </footer>
    </div>
  );
}
