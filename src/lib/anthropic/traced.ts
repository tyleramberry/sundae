// Shared Claude client with optional PostHog LLM observability.
//
// When NEXT_PUBLIC_POSTHOG_KEY is set, messages.create is wrapped by
// `@posthog/ai` so each call emits `$ai_generation` (tokens, latency, cost).
// Forced tool_choice replies are also recorded as `$ai_span` events — we
// don't execute those tools against the outside world, but PostHog traces
// expect a span per tool_use block.
//
// Missing PostHog config is a no-op: callers still get a normal Anthropic
// client. Keys stay in env; never hardcode a project token or Anthropic key.

import Anthropic from "@anthropic-ai/sdk";
import { Anthropic as PostHogAnthropic } from "@posthog/ai/anthropic";
import { getPostHogClient } from "@/lib/analytics/server";

export type LlmTraceContext = {
  /** Supabase user id when the caller has one. Omitted = anonymous events. */
  distinctId?: string;
  /** Groups generations in one conversation / cron run. */
  sessionId?: string;
  /** Call-site name shown on the generation in PostHog. */
  spanName: string;
};

type AnthropicClient = Anthropic | PostHogAnthropic;

let cached: AnthropicClient | null = null;
let cachedWithPosthog = false;

export function getAnthropicClient(): AnthropicClient {
  const posthog = getPostHogClient();
  const withPosthog = Boolean(posthog);
  if (cached && cachedWithPosthog === withPosthog) return cached;

  cachedWithPosthog = withPosthog;
  cached = posthog
    ? new PostHogAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY ?? "",
        posthog,
      })
    : new Anthropic();
  return cached;
}

export function buildLlmMonitoringParams(
  enabled: boolean,
  ctx: LlmTraceContext,
  traceId: string,
): Record<string, unknown> {
  if (!enabled) return {};
  return {
    posthogDistinctId: ctx.distinctId,
    posthogTraceId: traceId,
    // Serverless: flush before the isolate can freeze.
    posthogCaptureImmediate: true,
    posthogProperties: {
      $ai_span_name: ctx.spanName,
      feature: ctx.spanName,
      ...(ctx.sessionId ? { $ai_session_id: ctx.sessionId } : {}),
    },
  };
}

export async function createTracedMessage(
  params: Anthropic.MessageCreateParamsNonStreaming,
  ctx: LlmTraceContext,
): Promise<Anthropic.Messages.Message> {
  const client = getAnthropicClient();
  const posthog = getPostHogClient();
  const traceId = crypto.randomUUID();
  const monitoring = buildLlmMonitoringParams(Boolean(posthog), ctx, traceId);

  const response = (await client.messages.create({
    ...params,
    ...monitoring,
  })) as Anthropic.Messages.Message;

  await captureToolUseSpans(response, ctx, traceId);
  return response;
}

async function captureToolUseSpans(
  response: Anthropic.Messages.Message,
  ctx: LlmTraceContext,
  traceId: string,
): Promise<void> {
  const posthog = getPostHogClient();
  if (!posthog) return;

  const distinctId = ctx.distinctId;
  if (!distinctId) return;

  for (const block of response.content) {
    if (block.type !== "tool_use") continue;
    try {
      await posthog.captureImmediate({
        distinctId,
        event: "$ai_span",
        properties: {
          $ai_trace_id: traceId,
          ...(ctx.sessionId ? { $ai_session_id: ctx.sessionId } : {}),
          $ai_span_id: crypto.randomUUID(),
          $ai_span_name: block.name,
          $ai_input_state: block.input,
          $ai_output_state: { applied: true },
        },
      });
    } catch (err) {
      console.error("[analytics] $ai_span capture failed:", err);
    }
  }
}

export function llmSessionId(userId: string | undefined, suffix: string): string | undefined {
  if (!userId) return undefined;
  return `${userId}:${suffix}`;
}
