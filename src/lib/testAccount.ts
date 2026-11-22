// Built-in test accounts get unlimited free access (no session cap, no daily
// session-start throttle) and access to the /debug/* demo/sandbox tools even
// in production. Optional comma-separated SUNDAE_TEST_ACCOUNTS env var can
// extend this list without a code change.

const DEFAULT_TEST_ACCOUNT_EMAILS = ["tyleramberry@gmail.com"] as const;

function normalizeEmail(email: string | null | undefined): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function getTestAccountEmailSet(): Set<string> {
  const set = new Set<string>(DEFAULT_TEST_ACCOUNT_EMAILS);
  const extra = process.env.SUNDAE_TEST_ACCOUNTS;
  if (extra) {
    for (const part of extra.split(",")) {
      const normalized = normalizeEmail(part);
      if (normalized) set.add(normalized);
    }
  }
  return set;
}

export function isTestAccountEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return getTestAccountEmailSet().has(normalized);
}

export function canAccessDebugSurfaceForEmail(
  email: string | null | undefined,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  if (nodeEnv !== "production") return true;
  return isTestAccountEmail(email);
}
