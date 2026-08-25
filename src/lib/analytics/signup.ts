// First Google sign-in vs a returning login. Used by /auth/callback so
// signup_completed / Meta Lead only fire once, not on every OAuth round-trip.
export const NEW_SIGNUP_WINDOW_MS = 2 * 60 * 1000;

export function isNewSignup(
  createdAt: string | null | undefined,
  now: Date = new Date(),
  windowMs: number = NEW_SIGNUP_WINDOW_MS,
): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  return Math.abs(now.getTime() - created.getTime()) <= windowMs;
}

export function appendSearchParam(path: string, key: string, value: string): string {
  const qIndex = path.indexOf("?");
  const pathname = qIndex === -1 ? path : path.slice(0, qIndex);
  const search = qIndex === -1 ? "" : path.slice(qIndex + 1);
  const params = new URLSearchParams(search);
  params.set(key, value);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
