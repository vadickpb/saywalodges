import { describe, expect, it } from "vitest";
import {
  AvailabilityError, blockedDatesInMonth, clipRangeToMonth, dateRange, nightsBetween, parseDateRange,
  rangeContains, rangesAdjacent, rangesOverlap, type DateRange,
} from "./availability";
import { DateError } from "./dates";

const r = (start: string, end: string): DateRange => ({ start, end });
const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    if (error instanceof AvailabilityError || error instanceof DateError) return error.code;
    return "NOT_A_DOMAIN_ERROR";
  }
  return "NO_ERROR";
};

describe("dateRange / parseDateRange", () => {
  it("builds a one-night range", () => {
    expect(dateRange("2026-12-31", "2027-01-01")).toEqual(r("2026-12-31", "2027-01-01"));
  });

  it("rejects zero-length and inverted ranges with distinct codes", () => {
    expect(codeOf(() => dateRange("2026-05-05", "2026-05-05"))).toBe("EMPTY_RANGE");
    expect(codeOf(() => dateRange("2026-05-06", "2026-05-05"))).toBe("INVERTED_RANGE");
  });

  it("does not normalize invalid dates or timestamps", () => {
    expect(codeOf(() => dateRange("2027-02-29", "2027-03-02"))).toBe("INVALID_DATE");
    expect(codeOf(() => dateRange("2027-02-27", "2027-03-02T00:00:00Z"))).toBe("INVALID_FORMAT");
  });

  it("returns results instead of throwing for untrusted input", () => {
    expect(parseDateRange("2026-02-28", "2026-03-01")).toEqual({ ok: true, range: r("2026-02-28", "2026-03-01") });
    expect(parseDateRange("2026-02-28", "2026-02-28")).toEqual({
      ok: false, error: { code: "EMPTY_RANGE", input: { start: "2026-02-28", end: "2026-02-28" } },
    });
    expect(parseDateRange("2026-03-02", "2026-03-01")).toMatchObject({ ok: false, error: { code: "INVERTED_RANGE" } });
    expect(parseDateRange("2026-02-30", "2026-03-01")).toMatchObject({ ok: false, error: { code: "INVALID_DATE" } });
    expect(parseDateRange("x", "2026-03-01")).toMatchObject({ ok: false, error: { code: "INVALID_DATE" } });
  });
});

describe("nightsBetween", () => {
  it.each([
    ["2026-10-28", "2026-10-29", 1],
    ["2026-01-30", "2026-02-02", 3],
    ["2026-12-30", "2027-01-03", 4],
    ["2027-02-27", "2027-03-02", 3],
    ["2028-02-27", "2028-03-02", 4], // leap year: Feb 29 exists
    ["2028-01-01", "2029-01-01", 366],
    ["2026-01-01", "2027-01-01", 365],
  ])("counts %s → %s as %i nights", (checkIn, checkOut, expected) => {
    expect(nightsBetween(checkIn, checkOut)).toBe(expected);
  });

  it("treats zero and negative stays as invalid", () => {
    expect(codeOf(() => nightsBetween("2026-10-28", "2026-10-28"))).toBe("EMPTY_RANGE");
    expect(codeOf(() => nightsBetween("2026-10-29", "2026-10-28"))).toBe("INVERTED_RANGE");
  });
});

describe("rangeContains", () => {
  const stay = r("2026-12-30", "2027-01-02");

  it("includes start, excludes end", () => {
    expect(rangeContains(stay, "2026-12-30")).toBe(true);
    expect(rangeContains(stay, "2026-12-31")).toBe(true);
    expect(rangeContains(stay, "2027-01-01")).toBe(true);
    expect(rangeContains(stay, "2027-01-02")).toBe(false);
    expect(rangeContains(stay, "2026-12-29")).toBe(false);
  });

  it("rejects an invalid range or date", () => {
    expect(codeOf(() => rangeContains(r("2026-01-01", "2026-01-01"), "2026-01-01"))).toBe("EMPTY_RANGE");
    expect(codeOf(() => rangeContains(stay, "2026-02-30"))).toBe("INVALID_DATE");
  });
});

describe("rangesOverlap / rangesAdjacent", () => {
  it("back-to-back stays (check-out = next check-in) do not overlap but are adjacent", () => {
    const a = r("2026-11-01", "2026-11-05");
    const b = r("2026-11-05", "2026-11-08");
    expect(rangesOverlap(a, b)).toBe(false);
    expect(rangesOverlap(b, a)).toBe(false);
    expect(rangesAdjacent(a, b)).toBe(true);
    expect(rangesAdjacent(b, a)).toBe(true);
  });

  it("a one-day gap is neither overlap nor adjacency", () => {
    const a = r("2026-11-01", "2026-11-05");
    const b = r("2026-11-06", "2026-11-08");
    expect(rangesOverlap(a, b)).toBe(false);
    expect(rangesAdjacent(a, b)).toBe(false);
  });

  it.each([
    ["partial", r("2026-11-01", "2026-11-05"), r("2026-11-04", "2026-11-09")],
    ["one night shared", r("2026-11-01", "2026-11-05"), r("2026-11-04", "2026-11-05")],
    ["contained", r("2026-11-01", "2026-11-30"), r("2026-11-10", "2026-11-12")],
    ["identical", r("2026-11-01", "2026-11-05"), r("2026-11-01", "2026-11-05")],
    ["across the year", r("2026-12-30", "2027-01-02"), r("2027-01-01", "2027-01-05")],
  ])("detects %s overlap in both directions", (_name, a, b) => {
    expect(rangesOverlap(a, b)).toBe(true);
    expect(rangesOverlap(b, a)).toBe(true);
    expect(rangesAdjacent(a, b)).toBe(false);
  });

  it("rejects invalid ranges", () => {
    expect(codeOf(() => rangesOverlap(r("2026-01-02", "2026-01-01"), r("2026-01-01", "2026-01-05")))).toBe("INVERTED_RANGE");
    expect(codeOf(() => rangesAdjacent(r("2026-01-01", "2026-01-05"), r("2026-01-05", "2026-01-05")))).toBe("EMPTY_RANGE");
  });
});

describe("clipRangeToMonth", () => {
  it("returns the range unchanged when fully inside the month", () => {
    expect(clipRangeToMonth(r("2026-10-10", "2026-10-15"), "2026-10")).toEqual(r("2026-10-10", "2026-10-15"));
  });

  it("clips the start, the end, or both", () => {
    expect(clipRangeToMonth(r("2026-09-28", "2026-10-03"), "2026-10")).toEqual(r("2026-10-01", "2026-10-03"));
    expect(clipRangeToMonth(r("2026-10-29", "2026-11-04"), "2026-10")).toEqual(r("2026-10-29", "2026-11-01"));
    expect(clipRangeToMonth(r("2026-09-15", "2026-11-15"), "2026-10")).toEqual(r("2026-10-01", "2026-11-01"));
  });

  it("clips across the year boundary", () => {
    const stay = r("2026-12-29", "2027-01-03");
    expect(clipRangeToMonth(stay, "2026-12")).toEqual(r("2026-12-29", "2027-01-01"));
    expect(clipRangeToMonth(stay, "2027-01")).toEqual(r("2027-01-01", "2027-01-03"));
  });

  it("uses the right February length", () => {
    expect(clipRangeToMonth(r("2027-02-20", "2027-03-10"), "2027-02")).toEqual(r("2027-02-20", "2027-03-01"));
    expect(clipRangeToMonth(r("2028-02-20", "2028-03-10"), "2028-02")).toEqual(r("2028-02-20", "2028-03-01"));
  });

  it("returns null when the range only touches the month edge or is outside", () => {
    expect(clipRangeToMonth(r("2026-09-20", "2026-10-01"), "2026-10")).toBeNull(); // check-out on the 1st
    expect(clipRangeToMonth(r("2026-11-01", "2026-11-05"), "2026-10")).toBeNull(); // starts the day after
    expect(clipRangeToMonth(r("2026-01-01", "2026-02-01"), "2026-03")).toBeNull();
    expect(clipRangeToMonth(r("2027-01-05", "2027-01-08"), "2026-01")).toBeNull();
  });

  it("rejects invalid ranges and months", () => {
    expect(codeOf(() => clipRangeToMonth(r("2026-10-05", "2026-10-05"), "2026-10"))).toBe("EMPTY_RANGE");
    expect(codeOf(() => clipRangeToMonth(r("2026-10-05", "2026-10-06"), "2026-13"))).toBe("INVALID_MONTH");
    expect(codeOf(() => clipRangeToMonth(r("2026-10-05", "2026-10-06"), "2026-10-01"))).toBe("INVALID_FORMAT");
  });
});

describe("blockedDatesInMonth", () => {
  it("returns every occupied night and never the check-out day", () => {
    expect(blockedDatesInMonth([r("2026-10-10", "2026-10-13")], "2026-10")).toEqual(["2026-10-10", "2026-10-11", "2026-10-12"]);
  });

  it("returns nothing for no ranges or ranges outside the month", () => {
    expect(blockedDatesInMonth([], "2026-10")).toEqual([]);
    expect(blockedDatesInMonth([r("2026-09-20", "2026-10-01"), r("2026-11-01", "2026-11-04")], "2026-10")).toEqual([]);
  });

  it("clips a stay that crosses the month and the year", () => {
    const stay = [r("2026-12-30", "2027-01-03")];
    expect(blockedDatesInMonth(stay, "2026-12")).toEqual(["2026-12-30", "2026-12-31"]);
    expect(blockedDatesInMonth(stay, "2027-01")).toEqual(["2027-01-01", "2027-01-02"]);
  });

  it("blocks the whole month for a range that wraps it, with the right length", () => {
    const long = [r("2027-01-15", "2027-04-01")];
    expect(blockedDatesInMonth(long, "2027-02")).toHaveLength(28);
    expect(blockedDatesInMonth([r("2028-01-15", "2028-04-01")], "2028-02")).toHaveLength(29);
    expect(blockedDatesInMonth(long, "2027-03")).toHaveLength(31);
    expect(blockedDatesInMonth(long, "2027-04")).toEqual([]);
  });

  it("includes Feb 29 in a leap year only", () => {
    expect(blockedDatesInMonth([r("2028-02-28", "2028-03-02")], "2028-02")).toEqual(["2028-02-28", "2028-02-29"]);
    expect(blockedDatesInMonth([r("2028-02-28", "2028-03-02")], "2028-03")).toEqual(["2028-03-01"]);
    expect(blockedDatesInMonth([r("2027-02-27", "2027-03-02")], "2027-02")).toEqual(["2027-02-27", "2027-02-28"]);
  });

  it("merges adjacent ranges without gaps or duplicates", () => {
    const days = blockedDatesInMonth([r("2026-10-05", "2026-10-08"), r("2026-10-08", "2026-10-10")], "2026-10");
    expect(days).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
  });

  it("de-duplicates overlapping, contained and identical ranges, in any input order", () => {
    const ranges = [r("2026-10-08", "2026-10-12"), r("2026-10-05", "2026-10-09"), r("2026-10-08", "2026-10-12"), r("2026-10-06", "2026-10-07")];
    const expected = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];
    expect(blockedDatesInMonth(ranges, "2026-10")).toEqual(expected);
    expect(blockedDatesInMonth([...ranges].reverse(), "2026-10")).toEqual(expected);
  });

  it("keeps separate islands sorted", () => {
    expect(blockedDatesInMonth([r("2026-10-20", "2026-10-21"), r("2026-10-02", "2026-10-03")], "2026-10")).toEqual(["2026-10-02", "2026-10-20"]);
  });

  it("does not mutate its input", () => {
    const ranges = [r("2026-10-20", "2026-10-22"), r("2026-10-02", "2026-10-03")];
    const copy = structuredClone(ranges);
    blockedDatesInMonth(ranges, "2026-10");
    expect(ranges).toEqual(copy);
  });

  it("rejects a bad range anywhere in the list instead of skipping it", () => {
    expect(codeOf(() => blockedDatesInMonth([r("2026-10-02", "2026-10-03"), r("2026-10-05", "2026-10-05")], "2026-10"))).toBe("EMPTY_RANGE");
    expect(codeOf(() => blockedDatesInMonth([r("2026-10-06", "2026-10-05")], "2026-10"))).toBe("INVERTED_RANGE");
    expect(codeOf(() => blockedDatesInMonth([r("2026-02-30", "2026-03-05")], "2026-03"))).toBe("INVALID_DATE");
    expect(codeOf(() => blockedDatesInMonth([r("2026-10-02", "2026-10-03")], "2026-1"))).toBe("INVALID_FORMAT");
  });
});

describe("calendar domain boundaries", () => {
  it("validates the month even without blocks", () => {
    expect(codeOf(() => blockedDatesInMonth([], "2026-13"))).toBe("INVALID_MONTH");
    expect(codeOf(() => blockedDatesInMonth([], "2026-01\n"))).toBe("INVALID_FORMAT");
  });

  it("clips at both supported calendar limits", () => {
    expect(clipRangeToMonth(r("0001-01-01", "0001-02-02"), "0001-01"))
      .toEqual(r("0001-01-01", "0001-02-01"));
    expect(clipRangeToMonth(r("9999-11-30", "9999-12-31"), "9999-12"))
      .toEqual(r("9999-12-01", "9999-12-31"));
    expect(clipRangeToMonth(r("9999-11-01", "9999-12-01"), "9999-12")).toBeNull();
    const dates = blockedDatesInMonth([r("0001-01-01", "9999-12-31")], "9999-12");
    expect(dates).toHaveLength(30);
    expect(dates[0]).toBe("9999-12-01");
    expect(dates.at(-1)).toBe("9999-12-30");
    expect(blockedDatesInMonth([], "9999-12")).toEqual([]);
  });
});

describe("half-open interval reference", () => {
  it("matches occupied-day sets for all pairs across leap day and month end", () => {
    const dates = ["2028-02-26", "2028-02-27", "2028-02-28", "2028-02-29", "2028-03-01", "2028-03-02", "2028-03-03"];
    const cases = dates.flatMap((start, i) => dates.slice(i + 1).map((end, j) => ({
      range: r(start, end), occupied: dates.slice(i, i + j + 1),
    })));
    for (const a of cases) {
      for (const date of dates) expect(rangeContains(a.range, date)).toBe(a.occupied.includes(date));
      for (const b of cases) {
        expect(rangesOverlap(a.range, b.range)).toBe(a.occupied.some((date) => b.occupied.includes(date)));
        const touching = dates.indexOf(a.range.end) === dates.indexOf(b.range.start)
          || dates.indexOf(b.range.end) === dates.indexOf(a.range.start);
        expect(rangesAdjacent(a.range, b.range)).toBe(touching);
        for (const month of ["2028-02", "2028-03"]) {
          const expected = dates.filter((date) => date.startsWith(month)
            && (a.occupied.includes(date) || b.occupied.includes(date)));
          expect(blockedDatesInMonth([a.range, b.range], month)).toEqual(expected);
        }
      }
    }
  });
});
