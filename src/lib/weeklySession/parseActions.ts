import type { ClassifiedAction } from "@/lib/engine/weeklySessionTypes";
import type { PendingProposedAction } from "@/lib/weeklySession/persist";

const RECURRENCE_PATTERNS = ["daily", "weekly", "weekdays"] as const;
const RECURRENCE_DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

// Recurrence lands here from two very different sources -- the engine's
// tool_use output for isClassifiedAction, and the client's confirm-body
// for isIncomingAction. Both must accept the exact same shape (pattern
// required, days optional but required-when-weekly), so the check lives
// in one helper both validators call.
function isRecurrence(v: unknown): boolean {
  if (v === undefined) return true;
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  if (typeof r.pattern !== "string") return false;
  if (!(RECURRENCE_PATTERNS as readonly string[]).includes(r.pattern)) return false;
  if (r.days === undefined) {
    // `weekly` needs days -- reject weekly without them so a malformed
    // engine turn can't silently persist as an unusable recurrence.
    return r.pattern !== "weekly";
  }
  if (!Array.isArray(r.days)) return false;
  return r.days.every(
    (d) => typeof d === "string" && (RECURRENCE_DAYS as readonly string[]).includes(d),
  );
}

// cadenceCount and durationMinutes arrive from untrusted sources -- the
// engine's tool_use output and the client's confirm body -- and one drives
// how many weekly_items rows get inserted while the other sizes a calendar
// block, so both must be bounded integers. The ceiling of 7 on cadenceCount
// is the engine's every-day cadence ("7 = every day"); 1440 is one day of
// minutes. Absent (undefined) is fine -- callers default it.
function isBoundedInt(v: unknown, min: number, max: number): boolean {
  if (v === undefined) return true;
  return Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
}

export function isClassifiedAction(value: unknown): value is ClassifiedAction {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.role === "string" &&
    typeof v.description === "string" &&
    (v.type === "habit" || v.type === "goal" || v.type === "project") &&
    isBoundedInt(v.cadenceCount, 1, 7) &&
    (v.preferredTime === undefined || typeof v.preferredTime === "string") &&
    isBoundedInt(v.durationMinutes, 1, 1440) &&
    isRecurrence(v.recurrence) &&
    (v.weekday === undefined || (typeof v.weekday === "number" && v.weekday >= 0 && v.weekday <= 6))
  );
}

export function isIncomingAction(value: unknown): value is PendingProposedAction {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.role === "string" &&
    typeof v.description === "string" &&
    (v.type === "habit" || v.type === "goal" || v.type === "project") &&
    Array.isArray(v.blocks) &&
    v.blocks.every((b) => {
      if (!b || typeof b !== "object") return false;
      const block = b as Record<string, unknown>;
      return (
        typeof block.start === "string" &&
        typeof block.end === "string" &&
        (block.conflictsWith === undefined || typeof block.conflictsWith === "string")
      );
    }) &&
    isBoundedInt(v.cadenceCount, 1, 7) &&
    (v.preferredTime === undefined || typeof v.preferredTime === "string") &&
    isBoundedInt(v.durationMinutes, 1, 1440) &&
    isRecurrence(v.recurrence)
  );
}
