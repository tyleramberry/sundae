import { Suspense } from "react";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import FocusShell from "@/components/FocusShell";

// Standalone sign-in page. Reached from a deep link (a signed-out user
// hitting an app route redirects here with ?next=), from the landing page's
// CTA (?auto=google — auto-starts OAuth so the user doesn't click twice),
// or as a direct URL. `next` is forwarded through to /auth/callback.
async function LoginInner({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; auto?: string }>;
}) {
  const { next, error, auto } = await searchParams;

  return (
    <FocusShell>
      <div className="flex flex-1 flex-col justify-center gap-8 py-10">
        {/* New visitors land here too (the landing page's CTA hops here
            with ?auto=google on the marketing domain), so no "welcome
            back". */}
        <h1 className="display text-6xl sm:text-8xl">
          {auto === "google" ? (
            <>
              Off to
              <br />
              Google…
            </>
          ) : (
            <>
              Let&rsquo;s plan
              <br />
              your week.
            </>
          )}
        </h1>
        <p className="max-w-md text-lg leading-8 text-ink-secondary">
          Sign in with Google. Sundae reads your calendar to find open time,
          and only adds blocks you confirm.
        </p>
        {error && (
          <p className="border-l-2 border-red-600 pl-4 text-sm text-red-600">
            Something went wrong signing in. Please try again.
          </p>
        )}
        <div>
          <GoogleSignInButton
            next={next}
            autoStart={auto === "google"}
            label="Continue with Google"
            className="inline-flex items-center justify-center gap-3 rounded-full bg-ink py-2.5 pl-2.5 pr-7 text-base font-semibold text-white transition hover:-translate-y-0.5 hover:bg-ink/85 active:translate-y-0 disabled:opacity-60"
          />
        </div>
      </div>
    </FocusShell>
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; auto?: string }>;
}) {
  return (
    <Suspense>
      <LoginInner searchParams={searchParams} />
    </Suspense>
  );
}
