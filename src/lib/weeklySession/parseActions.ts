import type { ClassifiedAction } from "@/lib/engine/weeklySessionTypes";
import type { PendingProposedAction } from "@/lib/weeklySession/persist";

export function isClassifiedAction(value: unknown): value is ClassifiedAction {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.role === "string" &&
    typeof v.description === "string" &&
    (v.type === "habit" || v.type === "goal" || v.type === "project") &&
    (v.cadenceCount === undefined || typeof v.cadenceCount === "number") &&
    (v.preferredTime === undefined || typeof v.preferredTime === "string")
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
    v.blocks.every(
      (b) =>
        b &&
        typeof b === "object" &&
        typeof (b as Record<string, unknown>).start === "string" &&
        typeof (b as Record<string, unknown>).end === "string",
    ) &&
    (v.cadenceCount === undefined || typeof v.cadenceCount === "number") &&
    (v.preferredTime === undefined || typeof v.preferredTime === "string")
  );
}
