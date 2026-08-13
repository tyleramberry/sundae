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
