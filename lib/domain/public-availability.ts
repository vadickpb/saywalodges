import { blockedDatesInMonth, type DateRange } from "./availability";
import { addDays, currentMonthInLima, dayOfWeek, isIsoMonth, monthBounds, parseIsoMonth, todayInLima, type IsoDate, type IsoMonth } from "./dates";

// Month view of the public availability calendar (SD-308). Pure: occupied/free only.
// The database hands over bare half-open ranges (get_public_unit_availability); nothing
// here knows where an occupation came from, so nothing about it can leak to the page.

/** Months shown, counting the current one. Keeps the window inside the RPC's 731-day horizon. */
export const PUBLIC_CALENDAR_MONTHS = 23;

export type MonthNavigation = {
  month: IsoMonth;
  min: IsoMonth;
  max: IsoMonth;
  prev: IsoMonth | null;
  next: IsoMonth | null;
};

export function shiftMonth(month: IsoMonth, delta: number): IsoMonth {
  const { year, month: m } = parseIsoMonth(month);
  const index = year * 12 + (m - 1) + delta;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/**
 * Month to show for an untrusted `?month=` value. Anything missing, malformed or
 * outside [current month, +22 months] (Lima) falls back to the nearest allowed month.
 */
export function resolveCalendarMonth(raw: string | undefined, now: Date = new Date()): MonthNavigation {
  const min = currentMonthInLima(now);
  const max = shiftMonth(min, PUBLIC_CALENDAR_MONTHS - 1);
  let month = min;
  if (raw !== undefined && /^\d{4}-\d{2}$/.test(raw) && isIsoMonth(raw)) {
    month = raw < min ? min : raw > max ? max : raw;
  }
  return {
    month,
    min,
    max,
    prev: month > min ? shiftMonth(month, -1) : null,
    next: month < max ? shiftMonth(month, 1) : null,
  };
}

/** Half-open window `[from, to)` to ask the database for a month. */
export function monthWindow(month: IsoMonth): DateRange {
  const { start, endExclusive } = monthBounds(month);
  // Only reachable for 9999-12, far outside the navigable range.
  if (endExclusive === null) throw new RangeError(`monthWindow: ${month} has no exclusive end`);
  return { start, end: endExclusive };
}

export type DayStatus = "free" | "occupied" | "past";
export type CalendarCell = { date: IsoDate; day: number; status: DayStatus; today: boolean };
/** 7 entries per week, Monday first; null pads days of the neighbouring months. */
export type CalendarWeek = (CalendarCell | null)[];

/**
 * Weeks of `month`. A day is "occupied" when its night is taken (start inclusive, end
 * exclusive), so a check-out day is free for the next check-in. Days before today in Lima
 * are "past" and never shown as free.
 */
export function buildMonthGrid(month: IsoMonth, ranges: readonly DateRange[], now: Date = new Date()): CalendarWeek[] {
  const { start, days } = monthBounds(month);
  const today = todayInLima(now);
  const occupied = new Set(blockedDatesInMonth(ranges, month));
  const weeks: CalendarWeek[] = [];
  let week: CalendarWeek = Array.from({ length: (dayOfWeek(start) + 6) % 7 }, () => null);
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const status: DayStatus = date < today ? "past" : occupied.has(date) ? "occupied" : "free";
    week.push({ date, day: i + 1, status, today: date === today });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

/** Unit id for an untrusted `?unit=`: only ids of the property's own active units are honored. */
export function resolveUnitId(raw: string | undefined, unitIds: readonly string[]): string | null {
  if (unitIds.length === 0) return null;
  return raw !== undefined && unitIds.includes(raw) ? raw : (unitIds[0] ?? null);
}
