// Backslash and ASCII controls. Browsers treat "\" like "/" in URLs, so
// "/\evil.com" is another way to write a protocol-relative redirect.
const UNSAFE_NEXT = /[\\\u0000-\u001F\u007F]/;
const DUMMY_ORIGIN = "http://dummy.invalid";

// Only allow relative in-app paths as a post-login destination, so a
// crafted ?next=https://evil.example can't turn an auth redirect into an
// open redirect. Shared by /auth/callback and the dev sign-in bridge.
// Rejected values stay null, and callers fall back the same way they did
// before these extra checks.
export function safeNext(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  if (UNSAFE_NEXT.test(next)) return null;
  try {
    const parsed = new URL(next, DUMMY_ORIGIN);
    if (parsed.origin !== DUMMY_ORIGIN) return null;
  } catch {
    return null;
  }
  return next;
}

// Destination when `next` is missing or rejected. This is the path
// resolvePostAuthDestination returns for a user who already finished
// onboarding — the callback's fallback in that case. /auth/callback still
// computes the destination itself (a first-time signup with no `next` goes
// to /onboarding). The dev sign-in bridge only follows the seeded account,
// which already has onboarding answers, and the seed route passes
// next=/dashboard.
export const DEV_SIGN_IN_FALLBACK = "/dashboard";

export function devSignInDestination(next: string | null): string {
  return safeNext(next) ?? DEV_SIGN_IN_FALLBACK;
}
