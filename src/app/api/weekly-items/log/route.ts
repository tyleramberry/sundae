import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { currentWeekStart } from "@/lib/weeklySession/persist";

// In-app progress logging (Day 12's "logging is in-app only" requirement,
// built during the Day 11 UI pass). The daily follow-ups page and the
// dashboard deep-link both land here: a checkbox toggles `done` on a
// habit/goal row, a slider writes `percent` on a project row. This is the
// only thing that moves a role's KPI numerator.
//
// The update is always scoped to `user_id = auth.uid()` in addition to the
// RLS policy -- any request body is untrusted, so a caller can never touch a
// row that isn't theirs even if they guess another row's id.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    id?: unknown;
    done?: unknown;
    percent?: unknown;
  } | null;

  if (!body || typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ error: "Body must include a string `id`." }, { status: 400 });
  }

  const hasDone = body.done !== undefined;
  const hasPercent = body.percent !== undefined;

  if (hasDone && typeof body.done !== "boolean") {
    return NextResponse.json({ error: "`done` must be a boolean." }, { status: 400 });
  }
  if (hasPercent && typeof body.percent !== "number") {
    return NextResponse.json({ error: "`percent` must be a number." }, { status: 400 });
  }
  if (!hasDone && !hasPercent) {
    return NextResponse.json(
      { error: "Provide `done` (habit/goal) or `percent` (project)." },
      { status: 400 },
    );
  }

  const patch: { done?: boolean; percent?: number; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (hasDone) patch.done = body.done as boolean;
  if (hasPercent) {
    patch.percent = Math.max(0, Math.min(100, Math.round(body.percent as number)));
  }

  const weekStart = currentWeekStart();
  const { data: existing, error: loadError } = await supabase
    .from("weekly_items")
    .select("id, type, week_start")
    .eq("id", body.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }
  if (existing.week_start !== weekStart) {
    return NextResponse.json(
      { error: "Only this week's items can be logged here." },
      { status: 400 },
    );
  }
  if (hasDone && existing.type === "project") {
    return NextResponse.json({ error: "`done` is only valid for habits and goals." }, { status: 400 });
  }
  if (hasPercent && existing.type !== "project") {
    return NextResponse.json({ error: "`percent` is only valid for projects." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("weekly_items")
    .update(patch)
    .eq("id", body.id)
    .eq("user_id", user.id)
    .eq("week_start", weekStart)
    .select("id, role, type, title, done, percent")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  return NextResponse.json({ item: data });
}
