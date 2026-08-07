import { NextResponse } from "next/server";

// Shared guard for both Day 11 cron routes. Vercel Cron sends whatever
// Authorization header you configure -- the documented pattern is to set a
// CRON_SECRET env var and have Vercel invoke the job with
// `Authorization: Bearer <CRON_SECRET>`, so that's the contract here. Fails
// closed: an unset secret rejects every request rather than silently
// running unauthenticated (matches the stance in google/tokens.ts etc. of
// never assuming an env var is present).
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export function unauthorizedCronResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
