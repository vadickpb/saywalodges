import { parseDateRange, rangesOverlap, rangeContains, type DateRange } from "./availability";
import { MAX_MANUAL_NIGHTS } from "./calendar";
import { addDays, daysBetween } from "./dates";

export type CalendarSelection = { start: string; end: string | null } | null;

/** Display guidance only. The database remains authoritative for availability. */
export function selectCalendarDate(selection: CalendarSelection, date: string, blocks: readonly DateRange[]): CalendarSelection {
  if (!selection || selection.end || date <= selection.start) {
    return blocks.some((block) => rangeContains(block, date)) ? selection : { start: date, end: null };
  }
  const range = { start: selection.start, end: date };
  if (!parseDateRange(range.start, range.end).ok || daysBetween(range.start, range.end) > MAX_MANUAL_NIGHTS) return selection;
  // An occupied arrival day can still be the exclusive departure boundary.
  return blocks.some((block) => rangesOverlap(block, range)) ? selection : range;
}

export function calendarKeyboardDate(date: string, key: string): string | null {
  const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  if (delta[key] === undefined) return null;
  try { return addDays(date, delta[key]); } catch { return null; }
}
