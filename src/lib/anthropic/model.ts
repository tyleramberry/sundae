// Single place for the Anthropic model id. Override with ANTHROPIC_MODEL
// in .env.local — do not hardcode a model string in engine/agent files.
export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
}
