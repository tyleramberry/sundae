export function isFirstWeeklySessionUserMessage(
  displayTurns: Array<{ from: string }> | null | undefined,
): boolean {
  if (!displayTurns || displayTurns.length === 0) return true;
  return !displayTurns.some((turn) => turn.from === "user");
}
