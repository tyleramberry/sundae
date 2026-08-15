# Sundae

Weekly planning: define the roles you wear, plan actions against those
roles, and slot the plan onto Google Calendar. A daily cron nudges
follow-up and reconciles KPIs.

Product scope: [`docs/MVP-spec.md`](docs/MVP-spec.md). Conventions for
contributors: [`AGENTS.md`](AGENTS.md).

## Local setup

```bash
npm install
cp .env.local.example .env.local   # if you have one; otherwise copy from Vercel/env docs
npx supabase db push               # apply supabase/migrations
npm run dev
```

Required env (see existing Vercel project): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`CRON_SECRET` (cron fails closed if unset), Google OAuth client
id/secret, `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL`, Resend keys.
Production canonical URL is `https://sundaeplanner.com` (`NEXT_PUBLIC_APP_URL`).
Vercel `*.vercel.app` document requests redirect there (cron stays on Vercel).

## Scripts

- `npm run dev` — local app
- `npm run lint` / `npm run build`
- `npm test` — KPI math, calendar block placement, cron auth, parsers

## Layout

- `src/app/(app)/` — signed-in shell (dashboard, weekly session, daily follow-ups)
- `src/lib/engine/` — conversation engines (channel-agnostic; no `NextResponse`)
- `src/lib/weeklySession/` — transcript persist, throttle, week dates
- `src/lib/kpi/compute.ts` — only source of truth for “done”
- Calendar writes happen only in `/api/weekly-session/confirm` after the user confirms

`/debug/*` and harness APIs (`debug-step`, calendar test-event, email
debug, seed-test-account) 404 when `NODE_ENV === "production"`. Use them
only under `next dev`.
