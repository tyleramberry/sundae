import { NextResponse } from "next/server";

// Debug/harness routes and pages are for local `next dev` only. Vercel
// sets NODE_ENV=production for both production and preview deploys, which
// is the same gate seed-test-account already uses. Fail closed: anything
// that isn't a local dev server 404s rather than exposing Claude, calendar
// writes, or email debug surfaces.

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

export function productionUnavailableResponse() {
  return NextResponse.json(
    { error: "Not available outside local dev." },
    { status: 404 },
  );
}

// Middleware belt for routes that must not answer on a deployed host.
// /debug UI pages stay on the layout gate only — this list is the session
// bridge and the admin-minting API, which are the ones QA flagged.
export function isDevOnlySurfacePath(pathname: string): boolean {
  return (
    pathname === "/auth/dev-signin" ||
    pathname.startsWith("/auth/dev-signin/") ||
    pathname === "/api/debug" ||
    pathname.startsWith("/api/debug/")
  );
}

// Exact hostname, after dropping a numeric port. startsWith would treat
// localhost.evil.com and 127.0.0.1.evil.com as local. IPv6 is not a local
// host here; the previous check did not accept it either.
export function isLocalDevHost(host: string): boolean {
  const colon = host.lastIndexOf(":");
  const port = colon === -1 ? "" : host.slice(colon + 1);
  const hostname = colon !== -1 && /^\d+$/.test(port) ? host.slice(0, colon) : host;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

// 404 unless the request is local (exact localhost / 127.0.0.1, optional
// port) or NODE_ENV is not production. Local `next dev` stays open.
// A production NODE_ENV on localhost is still closed by the page and
// route handlers themselves.
export function shouldBlockDevOnlySurface(input: {
  pathname: string;
  isLocal: boolean;
  nodeEnv: string | undefined;
}): boolean {
  if (input.isLocal) return false;
  if (input.nodeEnv !== "production") return false;
  return isDevOnlySurfacePath(input.pathname);
}
