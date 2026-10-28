import { DateError, addDays, compareDates, daysBetween, monthBounds, type IsoDate, type IsoMonth } from "./dates";

// Availability helpers (SD-302). Pure; dates are civil ISO strings (see dates.ts).
//
// A range is half-open `[start, end)`, like the `daterange` of calendar_blocks
// and a stay [check_in, check_out): `start` is occupied, `end` is free for the
// next check-in. A valid range has at least one night — the database forbids
// empty ranges, so zero-length and inverted ranges are errors here too.
// Double booking itself is decided by the exclusion constraint, not by these
// helpers (CLAUDE.md): they only shape data for display and quoting.

export type DateRange = { start: IsoDate; end: IsoDate };

export type AvailabilityErrorCode = "EMPTY_RANGE" | "INVERTED_RANGE";

export class AvailabilityError extends Error {
  readonly code: AvailabilityErrorCode;

  constructor(code: AvailabilityErrorCode, message: string) {
    super(message);
    this.name = "AvailabilityError";
    this.code = code;
  }
}

export type DateRangeResult =
  | { ok: true; range: DateRange }
  | { ok: false; error: { code: "INVALID_DATE" | AvailabilityErrorCode; input: { start: string; end: string } } };

/** Throws `DateError` for malformed dates, `AvailabilityError` for empty/inverted ranges. */
export function dateRange(start: string, end: string): DateRange {
  const nights = daysBetween(start, end);
  if (nights === 0) throw new AvailabilityError("EMPTY_RANGE", `Range ${start}..${end} has zero nights`);
  if (nights < 0) throw new AvailabilityError("INVERTED_RANGE", `Range ${start}..${end} ends before it starts`);
  return { start, end };
}

/** Non-throwing variant for untrusted input. */
export function parseDateRange(start: string, end: string): DateRangeResult {
  try {
    return { ok: true, range: dateRange(start, end) };
  } catch (error) {
    const input = { start, end };
    if (error instanceof AvailabilityError) return { ok: false, error: { code: error.code, input } };
    if (error instanceof DateError) return { ok: false, error: { code: "INVALID_DATE", input } };
    throw error;
  }
}

/** Nights of a stay: whole days in `[checkIn, checkOut)`, always ≥ 1. */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const range = dateRange(checkIn, checkOut);
  return daysBetween(range.start, range.end);
}

/** `date` is occupied by the range (start inclusive, end exclusive). */
export function rangeContains(range: DateRange, date: IsoDate): boolean {
  const { start, end } = dateRange(range.start, range.end);
  return compareDates(date, start) >= 0 && compareDates(date, end) < 0;
}

/** Sharing a boundary (check-out day = next check-in day) is NOT an overlap. */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  const x = dateRange(a.start, a.end);
  const y = dateRange(b.start, b.end);
  return compareDates(x.start, y.end) < 0 && compareDates(y.start, x.end) < 0;
}

/** Back to back: one ends the day the other starts. */
export function rangesAdjacent(a: DateRange, b: DateRange): boolean {
  const x = dateRange(a.start, a.end);
  const y = dateRange(b.start, b.end);
  return x.end === y.start || y.end === x.start;
}

/** The part of `range` inside `month`, or null when they do not intersect. */
export function clipRangeToMonth(range: DateRange, month: IsoMonth): DateRange | null {
  return clipToBounds(range, monthBounds(month));
}

function clipToBounds(range: DateRange, bounds: ReturnType<typeof monthBounds>): DateRange | null {
  const { start, end } = dateRange(range.start, range.end);
  const clippedStart = compareDates(start, bounds.start) > 0 ? start : bounds.start;
  const clippedEnd = bounds.endExclusive === null || compareDates(end, bounds.endExclusive) < 0 ? end : bounds.endExclusive;
  return compareDates(clippedStart, clippedEnd) < 0 ? { start: clippedStart, end: clippedEnd } : null;
}

/**
 * Occupied dates of `month`, ascending and de-duplicated, from any set of
 * ranges (overlapping, duplicated, adjacent, spanning months/years, any
 * order). A range's `end` day is not occupied by that range.
 */
export function blockedDatesInMonth(ranges: readonly DateRange[], month: IsoMonth): IsoDate[] {
  const bounds = monthBounds(month);
  const days = new Set<IsoDate>();
  for (const range of ranges) {
    const clipped = clipToBounds(range, bounds);
    if (!clipped) continue;
    for (let day = clipped.start; day !== clipped.end; day = addDays(day, 1)) days.add(day);
  }
  return [...days].sort();
}
