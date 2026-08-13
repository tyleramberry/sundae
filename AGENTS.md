<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Sundae

A weekly-planning app: users define the roles/hats they wear, plan actions
against those roles each week, and get the plan slotted onto their real
Google Calendar. A daily cron nudges follow-up and reconciles KPIs.

## Stack

- **Next.js App Router** (`src/app`), route groups: `(app)` is the
  authenticated shell (dashboard, weekly session, daily follow-ups).
- **Supabase** for auth + Postgres. Three client entry points in
  `src/lib/supabase/` — `client.ts` (browser), `server.ts` (RSC/route
  handlers, cookie-based session), `admin.ts` (service-role, bypasses RLS —
  cron/debug routes only, never request-scoped user code).
- **Vercel Cron** (`vercel.json`) hits `/api/cron/daily-follow-up` and
  `/api/cron/reconcile-kpis` daily. Both routes are guarded by
  `src/lib/cron/auth.ts`, which fails closed if `CRON_SECRET` isn't set —
  don't relax that.
- **Google Calendar OAuth** via `src/lib/google/tokens.ts` (stored,
  refreshed tokens) and `src/lib/google/calendar.ts` (API calls). Access
  tokens are refreshed on demand, never assumed fresh.
- **Anthropic SDK** powers the planning engine (`src/lib/engine/`) and the
  daily/recap agents (`src/lib/agents/`). Model is overridable via
  `ANTHROPIC_MODEL` in `.env.local` — don't hardcode a model id elsewhere.
- Email via Resend (`src/lib/email/`, `RESEND_API_KEY` /
  `RESEND_FROM_EMAIL`).

## Conventions worth knowing before editing

- **The planning engine is channel-agnostic.** `src/lib/engine/engine.ts`
  and `weeklySession.ts` expose `processMessage`-style functions that take
  a message + conversation state and return a reply + next state. The web
  UI is the only caller today, but the contract deliberately doesn't assume
  a web request/response — don't thread `NextResponse` or route-handler
  concerns into the engine itself; that belongs in the `api/` route that
  calls it.
- **KPI math has one source of truth: `src/lib/kpi/compute.ts`.** Both the
  live dashboard tile and the 6-week trend view import from here so they
  can't disagree on what "done" means per role. Add new KPI logic here, not
  independently in a route or component. Note `percent: null` (nothing
  planned) is intentionally distinct from `0` (planned but not done) —
  don't collapse that distinction.
- **Calendar writes are confirm-before-write.** `/api/weekly-session/propose`
  is read-only — it slots proposed actions against the user's real calendar
  gaps but writes nothing. `/api/weekly-session/confirm` is the only place
  that calls `createCalendarEvent` and persists `weekly_items`. Don't add a
  second path that writes to the calendar without an explicit user
  confirm step in between.
- **The onboarding/planning engine used to be regex/keyword-based and broke
  on ordinary phrasing.** It's now an actual Claude call that reads the
  conversation and decides what's been established — see the comment at
  the top of `engine.ts` before "simplifying" it back into pattern matching.
- Routes under `src/app/debug/` and `src/app/api/debug/` are dev-only
  scaffolding (seeding test accounts, previewing emails, stepping the
  engine) — useful for locally exercising a flow, not part of the product
  surface. They 404 when `NODE_ENV === "production"` (see `src/lib/devOnly.ts`).
  `/api/weekly-session/debug-step`, calendar test-event, and email debug
  routes use the same gate. `/api/engine/step` is a real product path
  (Stage 0) and requires a signed-in session.
- `src/lib/engine/weeklySession*` is the conversation engine (Claude).
  `src/lib/weeklySession/` is persistence, throttle, and week-date helpers
  — the HTTP routes own those, not the engine.

## Docs

`docs/MVP-spec.md` is the source of truth for product scope. `docs/*-flow.md`
files describe the onboarding and weekly-session flows in detail;
`docs/30-Day-Calendar.md` tracks the build's day-by-day plan.
