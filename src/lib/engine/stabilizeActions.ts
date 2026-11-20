import {
  PERSONAL_ROLE,
  type ClassifiedAction,
  type LastWeekItem,
} from "@/lib/engine/weeklySessionTypes";

// Post-process the model's `actions` array. The engine still *understands*
// the conversation (that's Claude's job); this layer only enforces
// invariants the prompt has been shown to violate: locked items flipping
// role/type, a this-week slice of an ongoing Project spawning a second
// Project, a guessed preferredTime while the reply is still asking for
// one, and role strings that aren't on the caller's list.

const STOP = new Set([
  "the",
  "a",
  "an",
  "to",
  "for",
  "of",
  "and",
  "or",
  "on",
  "in",
  "at",
  "my",
  "your",
  "this",
  "that",
  "week",
  "with",
  "out",
  "get",
  "make",
]);

export function normalizeDescription(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function significantTokens(text: string): Set<string> {
  const tokens = normalizeDescription(text)
    .split(" ")
    .filter((w) => w.length > 2 && !STOP.has(w));
  return new Set(tokens);
}

export function descriptionOverlap(a: string, b: string): number {
  if (normalizeDescription(a) === normalizeDescription(b)) return 1;
  const A = significantTokens(a);
  const B = significantTokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export function clampRole(role: string, roles: string[]): string {
  const match = roles.find((r) => r.trim().toLowerCase() === role.trim().toLowerCase());
  return match ?? PERSONAL_ROLE;
}

export function replyAsksForClockTime(reply: string): boolean {
  return (
    /\bwhat time\b/i.test(reply) ||
    /\bwhich time\b/i.test(reply) ||
    /\bworks best\b/i.test(reply) ||
    /\bclock time\b/i.test(reply)
  );
}

function mergeLocked(locked: ClassifiedAction, incoming: ClassifiedAction): ClassifiedAction {
  // Role and type stay on the locked item so a re-read of the transcript
  // cannot silently re-file "Read together every night" under a different
  // hat. Description / cadence / time may update when the user is still
  // answering drill-down on the *same* item (e.g. they just gave 4pm).
  const next: ClassifiedAction = {
    ...locked,
    description: incoming.description || locked.description,
  };
  if (incoming.cadenceCount !== undefined) next.cadenceCount = incoming.cadenceCount;
  if (incoming.preferredTime !== undefined) next.preferredTime = incoming.preferredTime;
  if (incoming.durationMinutes !== undefined) next.durationMinutes = incoming.durationMinutes;
  if (incoming.recurrence !== undefined) next.recurrence = incoming.recurrence;
  if (incoming.weekday !== undefined) next.weekday = incoming.weekday;
  if (incoming.weekdays !== undefined) next.weekdays = incoming.weekdays;
  if (incoming.obstacleNote !== undefined) next.obstacleNote = incoming.obstacleNote;
  if (incoming.mitigationPlan !== undefined) next.mitigationPlan = incoming.mitigationPlan;
  if (next.type === "project") {
    delete next.cadenceCount;
    delete next.preferredTime;
    delete next.durationMinutes;
    delete next.recurrence;
    delete next.weekday;
    delete next.weekdays;
  }
  // Recurrence is Habit-only per PRD -- if the incoming turn reclassifies
  // to a Goal, drop whatever recurrence had settled on the locked item.
  // Project already cleared above.
  if (next.type === "goal") {
    delete next.recurrence;
  }
  return next;
}

function replyMentionsActionInTimeQuestion(reply: string, description: string): boolean {
  const sentences = reply.split(/(?<=[.!?])\s+|\n+/);
  const questionSentences = sentences.filter((s) => replyAsksForClockTime(s));
  const targetText = questionSentences.length > 0 ? questionSentences.join(" ") : reply;
  const replyTokens = significantTokens(targetText);
  const descTokens = significantTokens(description);
  for (const t of descTokens) {
    if (replyTokens.has(t)) return true;
  }
  return false;
}

function looksLikeSameProject(a: string, b: string): boolean {
  return descriptionOverlap(a, b) >= 0.75;
}

function looksLikeProjectSlice(slice: string, projectTitle: string): boolean {
  return descriptionOverlap(slice, projectTitle) >= 0.3;
}

const MATCH_THRESHOLD = 0.45;

export type StabilizeActionsInput = {
  locked: ClassifiedAction[];
  incoming: ClassifiedAction[];
  roles: string[];
  lastWeekItems?: LastWeekItem[];
  reply: string;
};

export function stabilizeActions({
  locked,
  incoming,
  roles,
  lastWeekItems = [],
  reply,
}: StabilizeActionsInput): ClassifiedAction[] {
  const askingTime = replyAsksForClockTime(reply);
  const usedIncoming = new Set<number>();
  const result: ClassifiedAction[] = [];

  for (const lockedItem of locked) {
    let bestIdx = -1;
    let bestScore = MATCH_THRESHOLD;
    for (let i = 0; i < incoming.length; i++) {
      if (usedIncoming.has(i)) continue;
      const score = descriptionOverlap(lockedItem.description, incoming[i].description);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) {
      result.push(lockedItem);
      continue;
    }
    usedIncoming.add(bestIdx);
    const merged = mergeLocked(lockedItem, incoming[bestIdx]);
    if (askingTime && !lockedItem.preferredTime) {
      delete merged.preferredTime;
    }
    result.push(merged);
  }

  const existingProjects = [
    ...result.filter((a) => a.type === "project"),
    ...locked.filter((a) => a.type === "project"),
    ...lastWeekItems
      .filter((i) => i.type === "project")
      .map(
        (i): ClassifiedAction => ({
          role: i.role,
          description: i.title,
          type: "project",
        }),
      ),
  ];

  const newNonProjectCount = incoming.filter(
    (raw, idx) => !usedIncoming.has(idx) && raw.type !== "project",
  ).length;

  for (let i = 0; i < incoming.length; i++) {
    if (usedIncoming.has(i)) continue;
    const raw = incoming[i];
    const item: ClassifiedAction = {
      ...raw,
      role: clampRole(raw.role, roles),
    };
    if (item.type === "project") {
      delete item.cadenceCount;
      delete item.preferredTime;
      delete item.durationMinutes;
      delete item.recurrence;
      delete item.weekday;
      delete item.weekdays;
    }
    if (item.type === "goal") {
      delete item.recurrence;
    }

    if (item.type === "project") {
      const same = existingProjects.find((p) => looksLikeSameProject(item.description, p.description));
      if (same) continue;
      const parent = existingProjects.find((p) => looksLikeProjectSlice(item.description, p.description));
      if (parent) {
        item.type = "goal";
        item.role = clampRole(parent.role, roles);
        delete item.cadenceCount;
      } else {
        existingProjects.push(item);
      }
    }

    if (
      askingTime &&
      item.type !== "project" &&
      (newNonProjectCount <= 1 || replyMentionsActionInTimeQuestion(reply, item.description))
    ) {
      delete item.preferredTime;
    }

    result.push(item);
  }

  return result;
}
