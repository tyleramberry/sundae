// The session-recap agent -- own file under src/lib/agents/, same
// reasoning as dailyNudgeAgent.ts: this runs once, unattended, after a
// weekly session completes, not as part of the back-and-forth conversation
// itself, so it gets its own home instead of living inside weeklySession.ts.
//
// Contract: it is handed the completed session's real transcript and
// extracts ONLY what the user actually said during Stage 1 (Accountability)
// -- up to three wins, up to three things to improve. It never invents an
// item, never pads a short list up to three, and returns empty arrays for
// a first-ever session (Accountability is skipped entirely when there's no
// prior week to review, so there's nothing to extract). The KPI numbers
// that go alongside this in the email are computed separately, by real
// code reading real weekly_items rows -- this agent only ever touches the
// free-text part a computation can't produce.
//
// If this call fails for any reason, the caller falls back to empty
// wins/improvements -- see getSessionRecap below -- so a Claude outage
// never blocks the confirm step or the recap email from going out with at
// least the KPI numbers.

import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicModel } from "@/lib/anthropic/model";
import type { Turn } from "@/lib/engine/types";

const client = new Anthropic();

const MODEL = getAnthropicModel();

const SYSTEM_PROMPT = `You read the transcript of a completed Sundae weekly-planning session. Early in the session (Stage 1, Accountability -- only present if the user had a prior week to review), Sundae asked the user what felt like wins from last week and what could be improved, and the user answered in their own words across one or more turns.

Extract ONLY what the user actually said in that exchange:
- Up to 3 wins, up to 3 things to improve, each as a short phrase close to the user's own words -- lightly cleaned up for grammar, not rewritten in tone or elaborated on.
- If the user gave fewer than 3 of either, return fewer. Never pad the list with something invented or inferred.
- If the transcript has no Accountability wins/improvements exchange at all (e.g. this was the user's first-ever session, which skips straight to Goal Setting), return empty arrays for both. Do not invent one.
- Ignore everything from Goal Setting and Planning (roles, goals, habit/project classification) -- that is not what this call is for.

On every turn call the extract_recap tool exactly once.`;

const TOOL: Anthropic.Tool = {
  name: "extract_recap",
  description: "Return the wins and improvements the user actually stated, verbatim in spirit.",
  input_schema: {
    type: "object",
    properties: {
      wins: {
        type: "array",
        items: { type: "string" },
        description: "Up to 3 short phrases. Empty if none were given.",
      },
      improvements: {
        type: "array",
        items: { type: "string" },
        description: "Up to 3 short phrases. Empty if none were given.",
      },
    },
    required: ["wins", "improvements"],
    additionalProperties: false,
  },
};

export type SessionRecap = {
  wins: string[];
  improvements: string[];
};

type ToolInput = SessionRecap;

function transcriptToText(turns: Turn[]): string {
  return turns
    .map((t) => `${t.role === "user" ? "USER" : "SUNDAE"}: ${t.content}`)
    .join("\n\n");
}

// The real Claude call. Exported so it can be inspected/tested on its own
// -- callers building the actual recap should use getSessionRecap below,
// which adds the fallback.
export async function extractSessionRecap(turns: Turn[]): Promise<SessionRecap> {
  if (turns.length === 0) {
    return { wins: [], improvements: [] };
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    thinking: { type: "disabled" },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: [TOOL],
    tool_choice: { type: "tool", name: "extract_recap" },
    messages: [{ role: "user", content: `Transcript:\n\n${transcriptToText(turns)}` }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("Session-recap agent bug: model did not call extract_recap despite forced tool_choice");
  }

  const result = toolUse.input as ToolInput;
  return {
    wins: Array.isArray(result.wins) ? result.wins.slice(0, 3) : [],
    improvements: Array.isArray(result.improvements) ? result.improvements.slice(0, 3) : [],
  };
}

// What callers should actually use: try the real agent, fall back to empty
// lists on any failure so the recap email still goes out with the KPI
// numbers, just without the wins/improvements section.
export async function getSessionRecap(turns: Turn[]): Promise<SessionRecap> {
  try {
    return await extractSessionRecap(turns);
  } catch (error) {
    console.error("Session-recap agent failed, sending recap without wins/improvements:", error);
    return { wins: [], improvements: [] };
  }
}
