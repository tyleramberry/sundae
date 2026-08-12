"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Dev-only sign-in bridge for /api/debug/seed-test-account. A magic link's
// hosted action_link redirects through Supabase's own verify endpoint into
// /auth/callback expecting a PKCE `code` -- but PKCE requires a
// code_verifier cookie the browser only has if it initiated the flow
// itself (like the real Google sign-in button does). A server-generated
// link visited cold has no such cookie, so that path 400s. verifyOtp
// sidesteps PKCE entirely: called here, client-side, with the token_hash
// the seed route hands it, it verifies the OTP directly and writes the
// resulting session into the browser the normal supabase-js way -- the
// exact mechanism /login would use if this were a real magic-link email.
// Inert without a real token_hash, which only the (dev-only, NODE_ENV
// -gated) seed route can mint, so this page doesn't need its own gate.
function DevSignInInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const tokenHash = searchParams.get("token_hash");
      const next = searchParams.get("next") ?? "/dashboard";

      if (!tokenHash) {
        setError("Missing token_hash.");
        return;
      }

      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "magiclink",
      });
      if (verifyError) {
        setError(verifyError.message);
        return;
      }
      router.replace(next);
    })();
  }, [router, searchParams]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-zinc-50 font-sans dark:bg-black">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {error ? `Sign-in failed: ${error}` : "Signing in…"}
      </p>
    </div>
  );
}

export default function DevSignInPage() {
  return (
    <Suspense>
      <DevSignInInner />
    </Suspense>
  );
}
