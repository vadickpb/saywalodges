import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DateError, addDays, assertIsoDate, compareDates, currentMonthInLima, dayOfWeek, daysBetween, daysInMonth,
  isIsoDate, isIsoMonth, monthBounds, monthOf, parseIsoDate, parseIsoMonth, todayInLima,
} from "./dates";

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof DateError ? error.code : "NOT_A_DATE_ERROR";
  }
  return "NO_ERROR";
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("parseIsoDate", () => {
  it("accepts real civil dates", () => {
    expect(parseIsoDate("2026-12-24")).toEqual({ ok: true, value: { year: 2026, month: 12, day: 24 } });
    expect(parseIsoDate("0001-01-01").ok).toBe(true);
    expect(parseIsoDate("9999-12-31").ok).toBe(true);
  });

  it.each(["2027-1-1", "2027-01-1", "27-01-01", "2027/01/01", " 2027-01-01", "2027-01-01 ", "", "2027-01", "20270101", "2027-01-01\n", "2027-01-01\r", "٢٠٢٧-٠١-٠١"])(
    "rejects malformed shape %j",
    (value) => {
      expect(parseIsoDate(value)).toEqual({ ok: false, error: { code: "INVALID_FORMAT", input: value } });
    },
  );

  it.each(["2027-01-01T00:00:00Z", "2027-01-01T00:00:00.000-05:00", "2027-01-01T00:00"])(
    "rejects timestamps %j instead of truncating them",
    (value) => {
      expect(parseIsoDate(value)).toMatchObject({ ok: false, error: { code: "INVALID_FORMAT" } });
    },
  );

  it.each(["2027-02-29", "2100-02-29", "2026-02-29", "2027-04-31", "2027-13-01", "2027-00-10", "2027-01-00", "2027-01-32", "0000-01-01"])(
    "rejects non-existent day %s instead of normalizing it",
    (value) => {
      expect(parseIsoDate(value)).toEqual({ ok: false, error: { code: "INVALID_DATE", input: value } });
    },
  );

  it("accepts leap days only in leap years", () => {
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2000-02-29")).toBe(true);
    expect(isIsoDate("1900-02-29")).toBe(false);
  });

  it("assertIsoDate throws a DateError carrying the code", () => {
    expect(codeOf(() => assertIsoDate("2027-02-29"))).toBe("INVALID_DATE");
    expect(codeOf(() => assertIsoDate("2027-02-29T00:00:00Z"))).toBe("INVALID_FORMAT");
    expect(assertIsoDate("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 });
  });
});

describe("months", () => {
  it("knows leap years and month lengths", () => {
    expect([2000, 2024, 2028].every((year) => daysInMonth(year, 2) === 29)).toBe(true);
    expect([1900, 2100, 2026].some((year) => daysInMonth(year, 2) === 29)).toBe(false);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 2)).toBe(28);
    expect([1, 3, 5, 7, 8, 10, 12].map((m) => daysInMonth(2026, m))).toEqual(Array(7).fill(31));
    expect([4, 6, 9, 11].map((m) => daysInMonth(2026, m))).toEqual(Array(4).fill(30));
    expect(codeOf(() => daysInMonth(2026, 13))).toBe("INVALID_MONTH");
    expect(codeOf(() => daysInMonth(0, 1))).toBe("INVALID_MONTH");
    expect(codeOf(() => daysInMonth(2026.5, 1))).toBe("INVALID_MONTH");
  });

  it("parses strict YYYY-MM", () => {
    expect(parseIsoMonth("2026-10")).toEqual({ year: 2026, month: 10 });
    expect(isIsoMonth("2026-10")).toBe(true);
    expect(codeOf(() => parseIsoMonth("2026-13"))).toBe("INVALID_MONTH");
    expect(codeOf(() => parseIsoMonth("2026-00"))).toBe("INVALID_MONTH");
    expect(codeOf(() => parseIsoMonth("0000-05"))).toBe("INVALID_MONTH");
    expect(codeOf(() => parseIsoMonth("2026-1"))).toBe("INVALID_FORMAT");
    expect(codeOf(() => parseIsoMonth("2026-10-01"))).toBe("INVALID_FORMAT");
    expect(isIsoMonth("2026-1")).toBe(false);
  });

  it("derives the month of a date", () => {
    expect(monthOf("2026-12-31")).toBe("2026-12");
    expect(monthOf("0042-03-01")).toBe("0042-03");
    expect(codeOf(() => monthOf("2026-12-32"))).toBe("INVALID_DATE");
  });

  it("returns half-open bounds that cross month and year", () => {
    expect(monthBounds("2026-12")).toEqual({ start: "2026-12-01", endExclusive: "2027-01-01", days: 31 });
    expect(monthBounds("2027-02")).toEqual({ start: "2027-02-01", endExclusive: "2027-03-01", days: 28 });
    expect(monthBounds("2028-02")).toEqual({ start: "2028-02-01", endExclusive: "2028-03-01", days: 29 });
    expect(monthBounds("2026-04").days).toBe(30);
    expect(monthBounds("9999-12")).toEqual({ start: "9999-12-01", endExclusive: null, days: 31 });
  });
});

describe("day arithmetic", () => {
  it("adds days across month, year and leap boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDays("2026-06-15", 0)).toBe("2026-06-15");
    expect(addDays("2026-01-01", 365)).toBe("2027-01-01");
    expect(addDays("2028-01-01", 366)).toBe("2029-01-01");
    expect(addDays("1970-01-01", -1)).toBe("1969-12-31");
  });

  it("is consistent with a native UTC reference over a long span", () => {
    for (let n = -800; n <= 800; n += 7) {
      const expected = new Date(Date.UTC(2028, 1, 29) + n * 86_400_000).toISOString().slice(0, 10);
      expect(addDays("2028-02-29", n)).toBe(expected);
      expect(daysBetween("2028-02-29", expected)).toBe(n);
    }
  });

  it("works for years below 100 (no Date.UTC 1900 remap)", () => {
    expect(addDays("0099-12-31", 1)).toBe("0100-01-01");
    expect(daysBetween("0001-01-01", "0002-01-01")).toBe(365);
  });

  it("rejects non-integer deltas and results outside 0001..9999", () => {
    expect(codeOf(() => addDays("2026-01-01", 1.5))).toBe("INVALID_INTEGER");
    expect(codeOf(() => addDays("2026-01-01", Number.NaN))).toBe("INVALID_INTEGER");
    expect(codeOf(() => addDays("2026-01-01", Infinity))).toBe("INVALID_INTEGER");
    expect(codeOf(() => addDays("9999-12-31", 1))).toBe("OUT_OF_RANGE");
    expect(codeOf(() => addDays("0001-01-01", -1))).toBe("OUT_OF_RANGE");
    expect(addDays("9999-12-31", 0)).toBe("9999-12-31");
    expect(codeOf(() => addDays("2026-02-30", 1))).toBe("INVALID_DATE");
  });

  it("computes signed differences", () => {
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(daysBetween("2027-01-02", "2026-12-30")).toBe(-3);
    expect(daysBetween("2026-05-05", "2026-05-05")).toBe(0);
    expect(daysBetween("2027-02-27", "2027-03-01")).toBe(2);
    expect(daysBetween("2028-02-27", "2028-03-01")).toBe(3);
    expect(daysBetween("2026-01-01", "2027-01-01")).toBe(365);
    expect(daysBetween("2028-01-01", "2029-01-01")).toBe(366);
    expect(codeOf(() => daysBetween("2026-01-01", "2026-01-01T00:00:00Z"))).toBe("INVALID_FORMAT");
  });

  it("compares dates", () => {
    expect(compareDates("2026-12-31", "2027-01-01")).toBe(-1);
    expect(compareDates("2027-01-01", "2026-12-31")).toBe(1);
    expect(compareDates("2027-01-01", "2027-01-01")).toBe(0);
    expect(codeOf(() => compareDates("2027-01-01", "nope"))).toBe("INVALID_FORMAT");
  });

  it("gives the weekday without depending on the host timezone", () => {
    expect(dayOfWeek("1970-01-01")).toBe(4); // Thursday
    expect(dayOfWeek("2026-10-28")).toBe(3); // Wednesday
    expect(dayOfWeek("2028-02-29")).toBe(2); // Tuesday
    expect(dayOfWeek("1969-12-31")).toBe(3);
    expect(dayOfWeek("2026-12-27")).toBe(0);
  });

  it("formats parts back to ISO with padding", () => {
    expect(addDays("0042-03-08", 1)).toBe("0042-03-09");
  });
});

describe("todayInLima", () => {
  it("is still the previous day in Lima just after UTC midnight", () => {
    expect(todayInLima(new Date("2026-03-01T00:00:00.000Z"))).toBe("2026-02-28");
    expect(todayInLima(new Date("2026-03-01T04:59:59.999Z"))).toBe("2026-02-28");
  });

  it("flips at 05:00 UTC (00:00 Lima)", () => {
    expect(todayInLima(new Date("2026-03-01T05:00:00.000Z"))).toBe("2026-03-01");
    expect(todayInLima(new Date("2026-03-01T23:59:59.999Z"))).toBe("2026-03-01");
  });

  it("crosses year and leap-day boundaries", () => {
    expect(todayInLima(new Date("2027-01-01T04:59:59.999Z"))).toBe("2026-12-31");
    expect(todayInLima(new Date("2027-01-01T05:00:00.000Z"))).toBe("2027-01-01");
    expect(todayInLima(new Date("2028-03-01T04:59:59.999Z"))).toBe("2028-02-29");
    expect(todayInLima(new Date("2027-03-01T04:59:59.999Z"))).toBe("2027-02-28");
  });

  it("uses UTC-5 in January and July 2026", () => {
    expect(todayInLima(new Date("2026-01-15T05:00:00Z"))).toBe("2026-01-15");
    expect(todayInLima(new Date("2026-07-15T04:59:59Z"))).toBe("2026-07-14");
    expect(todayInLima(new Date("2026-07-15T05:00:00Z"))).toBe("2026-07-15");
  });

  it("reads the (fake) system clock by default", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T23:30:00-05:00"));
    expect(todayInLima()).toBe("2026-12-31");
    expect(currentMonthInLima()).toBe("2026-12");
    vi.setSystemTime(new Date("2027-01-01T00:00:00Z"));
    expect(todayInLima()).toBe("2026-12-31");
    vi.setSystemTime(new Date("2027-01-01T05:00:00Z"));
    expect(todayInLima()).toBe("2027-01-01");
    expect(currentMonthInLima()).toBe("2027-01");
  });

  it.each(["UTC", "America/Lima", "Pacific/Auckland", "Asia/Tokyo", "America/New_York", "Pacific/Kiritimati"])(
    "ignores the host timezone (TZ=%s)",
    (tz) => {
      vi.stubEnv("TZ", tz);
      expect(todayInLima(new Date("2026-03-01T00:00:00Z"))).toBe("2026-02-28");
      expect(todayInLima(new Date("2026-03-01T05:00:00Z"))).toBe("2026-03-01");
      expect(todayInLima(new Date("2028-03-01T04:59:59.999Z"))).toBe("2028-02-29");
    },
  );

  it("rejects invalid or out-of-range instants", () => {
    expect(codeOf(() => todayInLima(new Date("nope")))).toBe("INVALID_CLOCK");
    expect(codeOf(() => todayInLima(new Date(-62_200_000_000_000)))).toBe("OUT_OF_RANGE");
    expect(codeOf(() => todayInLima(new Date(Date.UTC(10_000, 0, 2))))).toBe("OUT_OF_RANGE");
    expect(todayInLima(new Date(Date.UTC(10_000, 0, 1)))).toBe("9999-12-31");
  });
});

// Regression: Intl must distinguish 1 BC from 1 AD, without discarding 1 AD.
describe("Lima calendar limits", () => {
  it("accepts the first local day and rejects the preceding millisecond", () => {
    // ICU's historical America/Lima offset is -05:08:12 at this instant.
    expect(todayInLima(new Date("0001-01-01T05:08:12.000Z"))).toBe("0001-01-01");
    expect(codeOf(() => todayInLima(new Date("0001-01-01T05:08:11.999Z")))).toBe("OUT_OF_RANGE");
  });

  it("accepts the last local millisecond and rejects the next one", () => {
    expect(todayInLima(new Date("+010000-01-01T04:59:59.999Z"))).toBe("9999-12-31");
    expect(codeOf(() => todayInLima(new Date("+010000-01-01T05:00:00.000Z")))).toBe("OUT_OF_RANGE");
    for (const ms of [-8.64e15, 8.64e15]) {
      expect(codeOf(() => todayInLima(new Date(ms)))).toBe("OUT_OF_RANGE");
    }
    expect(codeOf(() => todayInLima(new Date(8.64e15 + 1)))).toBe("INVALID_CLOCK");
  });
});

describe("Gregorian arithmetic reference", () => {
  it("matches UTC at every month boundary in years 0001–9999", () => {
    // Independent native reference; setUTCFullYear avoids Date.UTC's 0–99 remap.
    const reference = new Date(0);
    for (let year = 1; year <= 9999; year++) {
      for (let month = 0; month < 12; month++) {
        reference.setUTCFullYear(year, month, 1);
        const start = reference.toISOString().slice(0, 10);
        const offset = reference.getTime() / 86_400_000;
        expect(daysBetween("1970-01-01", start)).toBe(offset);
        expect(addDays("1970-01-01", offset)).toBe(start);
        expect(addDays(start, -offset)).toBe("1970-01-01");
        expect(dayOfWeek(start)).toBe(reference.getUTCDay());
        reference.setUTCMonth(month + 1, 0);
        const end = reference.toISOString().slice(0, 10);
        expect(daysInMonth(year, month + 1)).toBe(reference.getUTCDate());
        expect(addDays(start, reference.getUTCDate() - 1)).toBe(end);
        expect(compareDates(start, end)).toBe(-1);
      }
    }
  }, 20_000);

  it.each(["0004", "0096", "0400", "1600", "2000", "2400"])("includes leap day in %s", (year) => {
    expect(addDays(`${year}-02-28`, 1)).toBe(`${year}-02-29`);
    expect(addDays(`${year}-03-01`, -1)).toBe(`${year}-02-29`);
  });

  it.each(["0100", "1700", "1800", "1900", "2100", "9900"])("omits leap day in %s", (year) => {
    expect(isIsoDate(`${year}-02-29`)).toBe(false);
    expect(addDays(`${year}-02-28`, 1)).toBe(`${year}-03-01`);
    expect(addDays(`${year}-03-01`, -1)).toBe(`${year}-02-28`);
  });
});
