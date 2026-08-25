// The authenticated app lives on the subdomain; the marketing landing page
// lives on the bare domain. In dev everything runs on localhost:3000.
export const CANONICAL_APP_URL = "https://app.sundaeplanner.com";
export const CANONICAL_LANDING_URL = "https://sundaeplanner.com";

/** URL for the authenticated app (OAuth redirects, Stripe, email links). */
export function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.NODE_ENV === "production") return CANONICAL_APP_URL;
  return "http://localhost:3000";
}

/** URL for the public marketing site (social OG, metadata). */
export function getLandingUrl(): string {
  if (process.env.NODE_ENV === "production") return CANONICAL_LANDING_URL;
  return "http://localhost:3000";
}
