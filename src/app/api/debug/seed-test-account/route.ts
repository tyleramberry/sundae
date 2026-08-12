import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveOnboardingAnswers } from "@/lib/onboarding/persist";
import { startOfWeek } from "@/lib/google/calendar";
import type { RoleAnswer } from "@/lib/engine/types";

// Dev-only demo seeder: creates a separate fake account (never your real
// tylersclaw1@gmail.com data) with 6 weeks of realistic-shaped weekly_items
// across 3 roles, then hands back a real signed-in session for it so the
// actual app -- dashboard, trend, daily follow-ups -- can be browsed with
// data instead of a bare account. Deliberately 404s outside local dev
// (`next dev` sets NODE_ENV=development; a Vercel build, including
// previews, does not) -- an admin-session-minting endpoint has no business
// existing in a deployed build, seed data or not.
//
// GET has a side effect (reseeds + mints a session) rather than the usual
// read-only contract, same tradeoff the /api/cron/* routes already make --
// acceptable here because the only way to reach it is a direct local URL,
// gated closed everywhere else.

const TEST_EMAIL = "sundae.demo@example.com";

type ItemTemplate = { title: string; type: "habit" | "goal" | "project" };

// Turns a target completion percentage into concrete done/percent values
// for a fixed list of items -- habits/goals get a leading run marked done
// (so the "which ones" reads sensibly, not scattered), a project gets a
// percent proportional to the target.
function planWeek(templates: ItemTemplate[], targetPercent: number) {
  const doneCount = Math.round((targetPercent / 100) * templates.length);
  return templates.map((t, i) => {
    if (t.type === "project") {
      return { ...t, percent: i < doneCount ? 100 : Math.max(10, Math.round(targetPercent * 0.7)) };
    }
    return { ...t, done: i < doneCount, percent: null as number | null };
  });
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function weekStartsAgo(weeksAgo: number): string {
  const d = startOfWeek(new Date());
  d.setDate(d.getDate() - weeksAgo * 7);
  return toDateOnly(d);
}

const FOUNDER_TEMPLATES: ItemTemplate[] = [
  { title: "Ship the weekly investor update", type: "goal" },
  { title: "Review the sales pipeline", type: "habit" },
  { title: "1:1 with cofounder", type: "habit" },
  { title: "Push to prod", type: "habit" },
  { title: "Close the seed round", type: "project" },
];
// Offsets 5..0 (oldest to current). null = nothing planned that week.
const FOUNDER_PLAN: (number | null)[] = [20, null, 45, 60, 78, 50];

const ATHLETE_TEMPLATES: ItemTemplate[] = [
  { title: "Run every morning", type: "habit" },
  { title: "Stretch every night", type: "habit" },
  { title: "Book a physical therapy session", type: "goal" },
];
// Only the last 3 weeks -- Athlete joined the plan later than Founder.
const ATHLETE_PLAN: (number | null)[] = [null, null, null, 53, 80, 50];

const PARENT_TEMPLATES: ItemTemplate[] = [
  { title: "Family dinner every night", type: "habit" },
  { title: "Read together every night", type: "habit" },
  { title: "Plan the weekend trip", type: "project" },
];
const PARENT_PLAN: (number | null)[] = [70, 85, null, 92, 40, 65];

const ROLES: { role: string; templates: ItemTemplate[]; plan: (number | null)[] }[] = [
  { role: "Founder", templates: FOUNDER_TEMPLATES, plan: FOUNDER_PLAN },
  { role: "Athlete", templates: ATHLETE_TEMPLATES, plan: ATHLETE_PLAN },
  { role: "Parent", templates: PARENT_TEMPLATES, plan: PARENT_PLAN },
];

const ANSWERS: RoleAnswer[] = [
  { role: "Founder", goals: ["Close the seed round"], context: "Pre-seed founder, fundraising this quarter." },
  { role: "Athlete", goals: ["Run every morning", "Stretch every night"], context: "Training for a fall half marathon." },
  { role: "Parent", goals: ["Family dinner every night"], context: "Two kids, trying to protect evenings." },
];

async function findOrCreateTestUser(admin: ReturnType<typeof createAdminClient>) {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    email_confirm: true,
  });
  if (!createError && created.user) return created.user;

  const { data: list, error: listError } = await admin.auth.admin.listUsers();
  if (listError) throw new Error(`Failed to list users: ${listError.message}`);
  const existing = list.users.find((u) => u.email === TEST_EMAIL);
  if (!existing) {
    throw new Error(`Could not create or find test user: ${createError?.message ?? "unknown error"}`);
  }
  return existing;
}

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available outside local dev." }, { status: 404 });
  }

  const admin = createAdminClient();

  const user = await findOrCreateTestUser(admin);

  await saveOnboardingAnswers(admin, {
    userId: user.id,
    roles: ROLES.map((r) => r.role),
    answers: ANSWERS,
  });

  // Reseed idempotently -- but weekly_items' own migration deliberately
  // grants no DELETE ("rows are never deleted once a week ends," per its
  // header comment; insert/update ARE granted to service_role, delete
  // is not, on purpose). So a re-run soft-removes the previous seed pass
  // via removed_at instead, same mechanism the real reconciliation cron
  // uses. Every dashboard/trend/follow-ups query already filters
  // `removed_at is null`, so the old rows just stop counting.
  const { error: softRemoveError } = await admin
    .from("weekly_items")
    .update({ removed_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("removed_at", null);
  if (softRemoveError) {
    return NextResponse.json({ error: softRemoveError.message }, { status: 500 });
  }

  const rows: {
    user_id: string;
    role: string;
    week_start: string;
    type: "habit" | "goal" | "project";
    title: string;
    google_event_id: null;
    done: boolean;
    percent: number | null;
  }[] = [];

  for (const { role, templates, plan } of ROLES) {
    plan.forEach((targetPercent, i) => {
      if (targetPercent === null) return; // no data that week, on purpose
      const weekStart = weekStartsAgo(plan.length - 1 - i);
      for (const item of planWeek(templates, targetPercent)) {
        rows.push({
          user_id: user.id,
          role,
          week_start: weekStart,
          type: item.type,
          title: item.title,
          google_event_id: null,
          done: "done" in item ? Boolean(item.done) : false,
          percent: item.percent,
        });
      }
    });
  }

  const { error: insertError } = await admin.from("weekly_items").insert(rows);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Hand back a real session via /auth/dev-signin rather than the hosted
  // action_link -- that link redirects into /auth/callback expecting a
  // PKCE code_verifier cookie the browser never set (see that page's file
  // header for the full reasoning). hashed_token + client-side verifyOtp
  // sidesteps PKCE entirely.
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: TEST_EMAIL,
  });
  if (linkError || !linkData) {
    return NextResponse.json(
      { error: linkError?.message ?? "Failed to generate a sign-in link", rowsSeeded: rows.length },
      { status: 500 },
    );
  }

  const signInUrl = new URL("/auth/dev-signin", request.nextUrl.origin);
  signInUrl.searchParams.set("token_hash", linkData.properties.hashed_token);
  signInUrl.searchParams.set("next", "/dashboard");

  return NextResponse.redirect(signInUrl);
}
