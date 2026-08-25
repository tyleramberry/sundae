# Smoke test — full product flow

Automated portion: from the repo root run:

```bash
npm run smoke
```

That is `lint` + unit tests + `next build`. CI (`.github/workflows/ci.yml`) already runs the same three steps on every push/PR to `main`.

If you don't have real Supabase env locally, dummy public keys are enough for the production compile:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon \
npm run smoke
```

Optional analytics/ads env (never required for a green smoke; missing keys = no tracking):

- `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` (defaults to `https://us.i.posthog.com`)
- `NEXT_PUBLIC_META_PIXEL_ID`
- `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN` (server Conversions API; Subscribe only)

---

## Manual checklist (production: https://sundaeplanner.com)

These steps need the live app, Google OAuth, a real calendar, and Stripe — they cannot be fully automated here.

### Core product

- [ ] Landing page loads, scroll works, all sections render, CTA buttons fire Google OAuth.
- [ ] FAQ still names the **$12/month** price after the 7-day trial (`MONTHLY_PRICE` in `src/app/page.tsx`).
- [ ] Google sign-in → onboarding → **subscribe (Stripe Checkout)** → dashboard for a new user.
- [ ] Returning entitled users skip checkout and land on the dashboard.
- [ ] Start a weekly session with all 3 stages (Accountability, Goal Setting, Planning).
- [ ] Confirm a plan with at least one Habit, one Goal, and one Project.
- [ ] Verify events appear on Google Calendar with correct times.
- [ ] Check the KPI dashboard — tiles show correct numerators/denominators.
- [ ] Click into a role's KPI — 6-week trend view renders.
- [ ] Go to `/daily-follow-ups` — log a habit as done, verify the KPI updates.
- [ ] Delete a confirmed calendar block, then wait for (or manually trigger) the reconcile-kpis cron — verify the deleted item's KPI adjusts.
- [ ] Check the daily email (trigger via `/api/email/daily-follow-up/debug` in non-production) — renders correctly with real data.

### Stripe (production or Stripe test mode)

- [ ] `/subscribe` starts Checkout; success returns to `/subscribe?checkout=success` and, after the webhook, the dashboard.
- [ ] Canceling Checkout returns to `/subscribe?checkout=canceled` with no charge.
- [ ] App shell gates unentitled users to `/subscribe`; `trialing` and `active` pass through.
- [ ] Sidebar “Manage subscription” opens the Stripe Customer Portal.
- [ ] Trial reminder email: a `trialing` row with `trial_end` in the next 24–48 hours is picked up by the daily follow-up cron.

### Analytics / ads (only if keys are set in Vercel)

- [ ] PostHog: `signup_completed` on first Google sign-in only; `trial_started` after Checkout; pageviews on client navigations.
- [ ] Meta Pixel: `Lead` after new signup (`?meta=lead` is stripped); `StartTrial` once when Checkout is confirmed entitled.

### Deploy

- [ ] Deploy to Vercel (push to `main`) after this checklist is green in preview.
