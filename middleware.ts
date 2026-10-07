import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import {
  productionUnavailableResponse,
  shouldBlockDevOnlySurface,
} from "@/lib/devOnly";
import {
  CANONICAL_APP_URL,
  CANONICAL_LANDING_URL,
  getAppUrl,
} from "@/lib/appUrl";

// ---------------------------------------------------------------------------
// Subdomain routing
//
// sundaeplanner.com     → marketing pages only (/, /privacy, /terms)
// app.sundaeplanner.com → everything else (auth, app, API, onboarding, etc.)
//
// In dev (localhost), no routing — everything serves from the same origin.
// ---------------------------------------------------------------------------

/** Paths that belong on the bare marketing domain. */
function isMarketingPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/privacy" || pathname === "/terms";
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const pathname = request.nextUrl.pathname;
  const isLocal =
    host.startsWith("localhost") || host.startsWith("127.0.0.1");

  // Dev sign-in and /api/debug never answer on a deployed production host.
  // Localhost is left to the route guards so `next dev` seeding still works.
  // Runs before the subdomain redirects so a preview URL 404s instead of
  // forwarding the path. Every other request still refreshes the session.
  if (
    shouldBlockDevOnlySurface({
      pathname,
      isLocal,
      nodeEnv: process.env.NODE_ENV,
    })
  ) {
    return productionUnavailableResponse();
  }

  if (!isLocal) {
    const appUrl = getAppUrl() === "http://localhost:3000"
      ? CANONICAL_APP_URL
      : getAppUrl();
    const appHost = new URL(appUrl).host;         // app.sundaeplanner.com
    const landingHost = new URL(CANONICAL_LANDING_URL).host; // sundaeplanner.com

    // 1. Vercel preview URLs → canonical domain
    if (host.includes("vercel.app")) {
      const dest = request.nextUrl.clone();
      if (isMarketingPath(pathname)) {
        dest.protocol = "https";
        dest.host = landingHost;
        dest.port = "";
      } else {
        dest.protocol = "https";
        dest.host = appHost;
        dest.port = "";
      }
      return NextResponse.redirect(dest, 308);
    }

    // 2. Bare domain, non-marketing path → redirect to app subdomain
    //    (API routes stay on whichever domain they're called on so cron
    //    and webhooks keep working without an extra hop.)
    if (
      host === landingHost &&
      !isMarketingPath(pathname) &&
      !pathname.startsWith("/api/")
    ) {
      const dest = request.nextUrl.clone();
      dest.protocol = "https";
      dest.host = appHost;
      dest.port = "";
      return NextResponse.redirect(dest, 308);
    }

    // 3. App subdomain root → dashboard (let (app)/layout.tsx handle auth)
    if (host === appHost && pathname === "/") {
      const dest = request.nextUrl.clone();
      dest.pathname = "/dashboard";
      return NextResponse.redirect(dest, 302);
    }
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
