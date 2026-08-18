import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { CANONICAL_APP_URL, getAppUrl } from "@/lib/appUrl";

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const pathname = request.nextUrl.pathname;
  const skipRedirect =
    pathname.startsWith("/api/cron") ||
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1");

  if (!skipRedirect && host.includes("vercel.app")) {
    try {
      const canonical = new URL(getAppUrl() === "http://localhost:3000" ? CANONICAL_APP_URL : getAppUrl());
      if (host !== canonical.host) {
        const dest = request.nextUrl.clone();
        dest.protocol = canonical.protocol;
        dest.host = canonical.host;
        dest.port = canonical.port;
        return NextResponse.redirect(dest, 308);
      }
    } catch {
      // Fall through to the session refresh if APP_URL is malformed.
    }
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
