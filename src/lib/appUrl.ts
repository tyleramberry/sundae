export const CANONICAL_APP_URL = "https://sundaeplanner.com";

export function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.NODE_ENV === "production") return CANONICAL_APP_URL;
  return "http://localhost:3000";
}
