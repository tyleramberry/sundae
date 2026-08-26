// The daily-nudge agent -- deliberately its own file under src/lib/agents/,
// separate from src/lib/engine/ (onboarding, weekly session, plan revision)
// and separate from src/lib/email/dailyFollowUp.ts (which only renders and
// sends). Those engines drive a back-and-forth conversation; this one runs
// once a day, unattended, with no user in the loop -- so it gets its own
// home instead of being folded into either.
//
// Contract: it is handed exactly what src/lib/dailyBrief/gather.ts found
// (today's real scheduled items, real ongoing projects) and returns only
// two short strings -- a greeting and a focus line. It never sees or
// invents anything beyond that input; the actual item list, project list,
// and CTA in the email are all rendered deterministically by
// dailyFollowUp.ts from the same real data, so a model slip can only make
// the copy sound off, never fabricate a task that doesn't exist.
//
// If this call fails for any reason (rate limit, network, bad key), the
// caller falls back to a deterministic line -- see buildFallbackNudgeCopy
// below -- so a Claude outage never blocks the actual email from sending.

import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicModel } from "@/lib/anthropic/model";
import { createTracedMessage, llmSessionId } from "@/lib/anthropic/traced";
import type { OngoingProject, TodayBrief, TodayItem } from "@/lib/dailyBrief/gather";

const MODEL = getAnthropicModel();

const SYSTEM_PROMPT = `You write the one or two lines of copy at the top of Sundae's daily follow-up email -- the short, warm bit before the actual list of today's items. You are given today's date, a list of items scheduled on the user's calendar today (could be empty), and a list of ongoing projects that still need work (could be empty).

Rules:
- Reference ONLY the items and projects you were given, by the exact titles provided. Never invent a task, a role, or a project that wasn't in the input.
- Do not restate the full list yourself -- the email already renders it below your copy. Your job is tone and framing, not a second copy of the data.
- If today's list is empty and there are no ongoing projects, write something like a light "clear day" framing -- don't pretend there's something to do.
- If there are ongoing projects but nothing scheduled today, it's fine to nudge toward one of them by name.
- Keep it short: greeting under 100 characters, focusLine under 140 characters. No exclamation-point-per-sentence enthusiasm -- match the plain, direct tone of the rest of the app's copy.

On every turn call the write_nudge_copy tool exactly once.`;

const TOOL: Anthropic.Tool = {
  name: "write_nudge_copy",
  description: "Return the two short lines of copy for the top of today's email.",
  input_schema: {
    type: "object",
    properties: {
      greeting: {
        type: "string",
        description: "A short, warm opening line. Under 100 characters.",
      },
      focusLine: {
        type: "string",
        description:
          "One sentence naming what today is about, in plain language. Under 140 characters.",
      },
    },
    required: ["greeting", "focusLine"],
    additionalProperties: false,
  },
};

export type NudgeCopy = {
  greeting: string;
  focusLine: string;
};

type ToolInput = NudgeCopy;

function describeItem(item: TodayItem): string {
  return `${item.title} (${item.role}, ${item.type})`;
}

function describeProject(project: OngoingProject): string {
  return `${project.title} (${project.role}, ${project.percent}% done)`;
}

// The real Claude call. Exported mainly so it can be tested/inspected on
// its own -- callers building the actual email should use
// getNudgeCopy below, which adds the fallback.
export async function generateNudgeCopy(brief: TodayBrief, userId?: string): Promise<NudgeCopy> {
  const userContent = [
    `Today: ${brief.weekdayLabel}`,
    "",
    brief.todayItems.length > 0
      ? `Scheduled today:\n${brief.todayItems.map((i) => `- ${describeItem(i)}`).join("\n")}`
      : "Scheduled today: nothing on the calendar.",
    "",
    brief.ongoingProjects.length > 0
      ? `Ongoing projects:\n${brief.ongoingProjects.map((p) => `- ${describeProject(p)}`).join("\n")}`
      : "Ongoing projects: none in progress this week.",
  ].join("\n");

  const response = await createTracedMessage(
    {
      model: MODEL,
      max_tokens: 512,
      thinking: { type: "disabled" },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: [TOOL],
      tool_choice: { type: "tool", name: "write_nudge_copy" },
      messages: [{ role: "user", content: userContent }],
    },
    {
      distinctId: userId,
      sessionId: llmSessionId(userId, `daily-nudge:${brief.dateISO}`),
      spanName: "daily-nudge",
    },
  );

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("Daily-nudge agent bug: model did not call write_nudge_copy despite forced tool_choice");
  }

  const result = toolUse.input as ToolInput;
  return { greeting: result.greeting, focusLine: result.focusLine };
}

// Deterministic copy for when the model call itself isn't available or
// fails -- keeps the email's own facts (the item/project lists) intact
// either way, since those never come from the model.
export function buildFallbackNudgeCopy(brief: TodayBrief): NudgeCopy {
  if (brief.todayItems.length === 0 && brief.ongoingProjects.length === 0) {
    return {
      greeting: `${brief.weekdayLabel}.`,
      focusLine: "Nothing on the calendar today — a good day to get ahead on next week.",
    };
  }
  if (brief.todayItems.length === 0) {
    return {
      greeting: `${brief.weekdayLabel}.`,
      focusLine: "Nothing scheduled today, but an ongoing project could use some time.",
    };
  }
  return {
    greeting: `${brief.weekdayLabel}.`,
    focusLine: `${brief.todayItems.length} item${brief.todayItems.length === 1 ? "" : "s"} on the calendar today.`,
  };
}

// What callers should actually use: try the real agent, fall back to the
// deterministic copy on any failure so a send is never blocked by it.
export async function getNudgeCopy(brief: TodayBrief, userId?: string): Promise<NudgeCopy> {
  try {
    return await generateNudgeCopy(brief, userId);
  } catch (error) {
    console.error("Daily-nudge agent failed, using fallback copy:", error);
    return buildFallbackNudgeCopy(brief);
  }
}
