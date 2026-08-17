// Best-effort recovery helpers: reconstruct a Habit/Goal's cadenceCount
// and preferredTime from its free-text description alone. ONLY meant for
// /api/weekly-session/retry-calendar, to backfill items whose original
// structured cadenceCount/preferredTime were lost to the all-day-event bug
// (createWeeklyItems used to collapse an unplaced Habit down to a single
// row with no record of its intended cadence -- see that function's
// comment; that's fixed going forward, but can't undo what already
// happened to an already-confirmed week). The normal
// classify -> propose -> confirm path always has the real structured
// fields from the engine and should never need this.
//
// Regex-based and deliberately conservative: returns null rather than
// guessing when the text doesn't clearly say so, since a wrong guess here
// writes a real event to the user's real calendar.

const AT_TIME = /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;
// "from 6:00 to 10:00pm" -- the start time (6:00) commonly omits its own
// am/pm, inheriting it from the end of the range by ordinary English
// convention. Captured separately so the start half can borrow the end
// half's am/pm when it doesn't have its own.
const FROM_TO = /\bfrom\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+to\s+\d{1,2}(?::\d{2})?\s*(am|pm)\b/i;
const BARE_TIME = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;

function toHHMM(hourRaw: number, minute: number, ampm: string): string | null {
  let h = hourRaw;
  if (h < 1 || h > 12 || minute > 59) return null;
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// "...at 4:00pm" -> "16:00". Tries three patterns in order of how
// reliably each one identifies the *start* time specifically (a
// description can mention more than one clock time):
//   1. "at H(:MM)(am|pm)" -- the exact wording the SMART drill-down asks
//      for, and unambiguous about which time it's naming.
//   2. "from H1(:MM)? to H2(:MM)?(am|pm)" -- takes H1, inheriting H2's
//      am/pm if H1 didn't state its own ("from 6:00 to 10:00pm" means
//      6:00 PM, not the first bare-number match, which would wrongly
//      grab 10:00pm here).
//   3. Any bare "H(:MM)?(am|pm)" as a last resort.
export function preferredTimeFromText(text: string): string | null {
  const at = AT_TIME.exec(text);
  if (at) return toHHMM(Number(at[1]), Number(at[2] ?? 0), at[3].toLowerCase());

  const fromTo = FROM_TO.exec(text);
  if (fromTo) {
    const ampm = (fromTo[3] ?? fromTo[4]).toLowerCase();
    return toHHMM(Number(fromTo[1]), Number(fromTo[2] ?? 0), ampm);
  }

  const bare = BARE_TIME.exec(text);
  if (bare) return toHHMM(Number(bare[1]), Number(bare[2] ?? 0), bare[3].toLowerCase());

  return null;
}

const WEEKDAY_RANGE = /\bmonday\s+through\s+friday\b|\bmon(?:day)?\s*-\s*fri(?:day)?\b|\bweekdays?\b/i;
const EVERY_DAY = /\bevery\s+day\b|\bevery\s+morning\b|\bevery\s+night\b|\bdaily\b/i;
const N_TIMES = /\b(\d+)\s*(?:x|times)\b/i;

// Only ever called for a `type: "habit"` row -- a cadence signal in a
// Goal's text ("call mom 3x this year") isn't this function's business,
// same boundary the engine's own classification rules draw.
export function cadenceCountFromText(text: string): number | null {
  if (EVERY_DAY.test(text)) return 7;
  if (WEEKDAY_RANGE.test(text)) return 5;
  const match = N_TIMES.exec(text);
  if (match) {
    const count = Number(match[1]);
    if (count >= 1 && count <= 7) return count;
  }
  return null;
}
