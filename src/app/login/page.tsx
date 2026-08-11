import { Suspense } from "react";
import GoogleSignInButton from "@/components/GoogleSignInButton";

// Standalone sign-in page. Reached from a deep link (a signed-out user
// hitting an app route redirects here with ?next=), or as a direct URL. The
// landing page CTA launches OAuth on its own, so this is the secondary
// entry point. `next` is forwarded through to /auth/callback.
async function LoginInner({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-md flex-col items-center justify-center gap-8 px-6 py-32 text-center sm:px-16">
        <span className="text-sm font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Sundae
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Sign in
        </h1>
        <p className="text-base text-zinc-600 dark:text-zinc-400">
          Connect your Google account so Sundae can read and propose blocks on
          your calendar.
        </p>
        {error && (
          <p className="text-sm text-red-600">
            Something went wrong signing in. Please try again.
          </p>
        )}
        <GoogleSignInButton next={next} />
      </main>
    </div>
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  return (
    <Suspense>
      <LoginInner searchParams={searchParams} />
    </Suspense>
  );
}
