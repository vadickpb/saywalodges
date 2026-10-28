// Civil-date helpers (SD-302). Pure: no I/O, no machine timezone.
//
// Stays and calendar blocks are `date` values in America/Lima, not instants
// (CLAUDE.md). A civil date is a strict `YYYY-MM-DD` string; a month is a strict
// `YYYY-MM` string. Arithmetic runs on a proleptic-Gregorian day count, so no
// `Date`, UTC offset or DST of the host participates — except `todayInLima`,
// whose only input is an explicit instant (default: the clock).
//
// Nothing is normalized silently: `2027-02-29`, `2027-13-01`, `2027-1-1`,
// `2027-01-01T00:00:00Z` or `0000-01-01` are errors, never "the nearest date".

/** `YYYY-MM-DD`, year 0001–9999, a real calendar day. */
export type IsoDate = string;
/** `YYYY-MM`, year 0001–9999. */
export type IsoMonth = string;

export type DateErrorCode =
  | "INVALID_FORMAT" // not the YYYY-MM-DD / YYYY-MM shape (includes timestamps)
  | "INVALID_DATE" // right shape, not a calendar day (2027-02-29)
  | "INVALID_MONTH" // right shape, month outside 01–12 or year 0000
  | "INVALID_INTEGER" // a day delta that is not a safe integer
  | "OUT_OF_RANGE" // result falls outside 0001-01-01..9999-12-31
  | "INVALID_CLOCK"; // an invalid `Date` instant

export class DateError extends Error {
  readonly code: DateErrorCode;

  constructor(code: DateErrorCode, message: string) {
    super(message);
    this.name = "DateError";
    this.code = code;
  }
}

export type CivilDate = { year: number; month: number; day: number };

export type ParseDateResult =
  | { ok: true; value: CivilDate }
  | { ok: false; error: { code: "INVALID_FORMAT" | "INVALID_DATE"; input: string } };

const MIN_YEAR = 1;
const MAX_YEAR = 9999;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH = /^(\d{4})-(\d{2})$/;
const LIMA_TIME_ZONE = "America/Lima";

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new DateError("INVALID_MONTH", `daysInMonth: invalid year/month ${year}/${month}`);
  }
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

// Non-throwing parse for untrusted input (forms, URLs, DB rows).
export function parseIsoDate(value: string): ParseDateResult {
  const match = ISO_DATE.exec(value);
  if (!match) return { ok: false, error: { code: "INVALID_FORMAT", input: value } };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < MIN_YEAR || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return { ok: false, error: { code: "INVALID_DATE", input: value } };
  }
  return { ok: true, value: { year, month, day } };
}

export function isIsoDate(value: string): boolean {
  return parseIsoDate(value).ok;
}

export function assertIsoDate(value: string): CivilDate {
  const result = parseIsoDate(value);
  if (!result.ok) {
    throw new DateError(result.error.code, `Invalid ISO date ${JSON.stringify(value)}: expected a real YYYY-MM-DD day`);
  }
  return result.value;
}

function formatIsoDate({ year, month, day }: CivilDate): IsoDate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseIsoMonth(value: string): { year: number; month: number } {
  const match = ISO_MONTH.exec(value);
  if (!match) throw new DateError("INVALID_FORMAT", `Invalid ISO month ${JSON.stringify(value)}: expected YYYY-MM`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < MIN_YEAR || month < 1 || month > 12) {
    throw new DateError("INVALID_MONTH", `Invalid ISO month ${JSON.stringify(value)}`);
  }
  return { year, month };
}

export function isIsoMonth(value: string): boolean {
  try {
    parseIsoMonth(value);
    return true;
  } catch {
    return false;
  }
}

export function monthOf(date: IsoDate): IsoMonth {
  const { year, month } = assertIsoDate(date);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

// Days since 1970-01-01 (Hinnant's days_from_civil). Integer math only.
function toEpochDay({ year, month, day }: CivilDate): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

function fromEpochDay(epochDay: number): CivilDate {
  const z = epochDay + 719_468;
  const era = Math.floor(z / 146_097);
  const dayOfEra = z - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36_524) - Math.floor(dayOfEra / 146_096)) / 365,
  );
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const mp = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

const MIN_EPOCH_DAY = toEpochDay({ year: MIN_YEAR, month: 1, day: 1 });
const MAX_EPOCH_DAY = toEpochDay({ year: MAX_YEAR, month: 12, day: 31 });

/** Signed difference `to - from` in whole days. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return toEpochDay(assertIsoDate(to)) - toEpochDay(assertIsoDate(from));
}

/** -1 | 0 | 1. Valid ISO dates also sort lexicographically, but this validates. */
export function compareDates(a: IsoDate, b: IsoDate): -1 | 0 | 1 {
  const diff = daysBetween(b, a);
  return diff < 0 ? -1 : diff > 0 ? 1 : 0;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  if (!Number.isSafeInteger(days)) {
    throw new DateError("INVALID_INTEGER", `addDays: days must be a safe integer, got ${days}`);
  }
  const target = toEpochDay(assertIsoDate(date)) + days;
  if (target < MIN_EPOCH_DAY || target > MAX_EPOCH_DAY) {
    throw new DateError("OUT_OF_RANGE", `addDays: ${date} ${days >= 0 ? "+" : "-"} ${Math.abs(days)} days leaves 0001-01-01..9999-12-31`);
  }
  return formatIsoDate(fromEpochDay(target));
}

/** 0 = Sunday … 6 = Saturday, independent of the host timezone. */
export function dayOfWeek(date: IsoDate): number {
  // 1970-01-01 was a Thursday (4).
  return (((toEpochDay(assertIsoDate(date)) + 4) % 7) + 7) % 7;
}

/**
 * Month as `[start, endExclusive)`. For 9999-12, endExclusive is null:
 * the next day is outside the supported calendar, not a valid IsoDate.
 * `days` still includes all 31 days; range endpoints remain limited to 9999-12-31.
 */
export function monthBounds(month: IsoMonth): { start: IsoDate; endExclusive: IsoDate | null; days: number } {
  const { year, month: m } = parseIsoMonth(month);
  const days = daysInMonth(year, m);
  const start = formatIsoDate({ year, month: m, day: 1 });
  return { start, endExclusive: year === MAX_YEAR && m === 12 ? null : addDays(start, days), days };
}

// Fixed options so output never depends on the host's default locale/calendar.
const limaParts = new Intl.DateTimeFormat("en-US", {
  timeZone: LIMA_TIME_ZONE,
  calendar: "gregory",
  numberingSystem: "latn",
  era: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Civil date in America/Lima for an instant. The instant is an explicit
 * parameter so callers and tests pin the clock; the default reads it once
 * (`vi.setSystemTime` controls it in tests). The host TZ never matters.
 */
export function todayInLima(now: Date = new Date()): IsoDate {
  const instant = now.getTime();
  if (!Number.isFinite(instant)) throw new DateError("INVALID_CLOCK", "todayInLima: invalid Date instant");
  const parts = new Map<string, string>();
  for (const part of limaParts.formatToParts(now)) parts.set(part.type, part.value);
  const result = parseIsoDate(`${parts.get("year")?.padStart(4, "0")}-${parts.get("month")}-${parts.get("day")}`);
  // Gregorian era is necessary: Intl formats 1 BC with the same year number as 1 AD.
  if (parts.get("era") !== "AD" || !result.ok) throw new DateError("OUT_OF_RANGE", "todayInLima: instant outside the supported calendar range");
  return formatIsoDate(result.value);
}

export function currentMonthInLima(now: Date = new Date()): IsoMonth {
  return monthOf(todayInLima(now));
}
