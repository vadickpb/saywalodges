import { describe, it, expect } from "vitest";
import {
  nightsBetween,
  positiveMoneySchema,
  rentalProfits,
  summarizeEntries,
  toPenCents,
  type FinanceEntry,
} from "./finance";

let seq = 0;
function entry(over: Partial<FinanceEntry> & Pick<FinanceEntry, "kind" | "amountPenCents">): FinanceEntry {
  seq += 1;
  return {
    id: `e${String(seq).padStart(3, "0")}`,
    categoryId: over.kind === "income" ? "c-rental" : "c-water",
    categoryKey: over.kind === "income" ? "rental" : "water",
    occurredOn: "2027-01-15",
    unitId: null,
    relatedEntryId: null,
    stayStart: null,
    stayEnd: null,
    ...over,
  };
}

describe("positiveMoneySchema", () => {
  it("converts decimal text to exact cents", () => {
    expect(positiveMoneySchema.parse("123.45")).toBe(12345);
    expect(positiveMoneySchema.parse("12,5")).toBe(1250);
    expect(positiveMoneySchema.parse("7")).toBe(700);
  });
  it("rejects zero, negatives and garbage", () => {
    expect(positiveMoneySchema.safeParse("0").success).toBe(false);
    expect(positiveMoneySchema.safeParse("0.00").success).toBe(false);
    expect(positiveMoneySchema.safeParse("-5").success).toBe(false);
    expect(positiveMoneySchema.safeParse("abc").success).toBe(false);
  });
});

describe("toPenCents", () => {
  it("converts PEN one to one", () => {
    expect(toPenCents({ amountCents: 80000, currency: "PEN" })).toEqual({ ok: true, cents: 80000 });
    expect(toPenCents({ amountCents: 80000, currency: "PEN", fxRatePen: null })).toEqual({ ok: true, cents: 80000 });
  });
  it("rejects a rate on PEN", () => {
    expect(toPenCents({ amountCents: 100, currency: "PEN", fxRatePen: 1 })).toEqual({ ok: false, error: "FX_NOT_ALLOWED" });
  });
  it("rounds half up to the cent, matching the database", () => {
    expect(toPenCents({ amountCents: 100, currency: "USD", fxRatePen: 3.755 })).toEqual({ ok: true, cents: 376 });
    expect(toPenCents({ amountCents: 12345, currency: "USD", fxRatePen: "3.7512" })).toEqual({ ok: true, cents: 46309 });
    expect(toPenCents({ amountCents: 1, currency: "USD", fxRatePen: "0.5" })).toEqual({ ok: true, cents: 1 });
    expect(toPenCents({ amountCents: 1, currency: "USD", fxRatePen: "0.499999" })).toEqual({ ok: true, cents: 0 });
  });
  it("reads numeric(12,6) strings with trailing zeros and whole numbers", () => {
    expect(toPenCents({ amountCents: 1000, currency: "USD", fxRatePen: "3.755000" })).toEqual({ ok: true, cents: 3755 });
    expect(toPenCents({ amountCents: 1000, currency: "USD", fxRatePen: " 4 " })).toEqual({ ok: true, cents: 4000 });
    expect(toPenCents({ amountCents: 1000, currency: "USD", fxRatePen: "99.999999" })).toEqual({ ok: true, cents: 100_000 });
  });
  it("treats a number that rounds up to 100 as an invalid rate, like the database check", () => {
    expect(toPenCents({ amountCents: 100, currency: "USD", fxRatePen: 99.9999995 })).toEqual({ ok: false, error: "INVALID_FX" });
  });
  it("requires a valid rate for foreign currencies", () => {
    const bad = (fxRatePen?: string | number | null) => toPenCents({ amountCents: 100, currency: "USD", fxRatePen });
    expect(bad()).toEqual({ ok: false, error: "FX_REQUIRED" });
    expect(bad(null)).toEqual({ ok: false, error: "FX_REQUIRED" });
    for (const rate of [0, "0", "0.000000", 100, "100", "abc", "", "1.1234567", -2, NaN, Infinity]) {
      expect(bad(rate)).toEqual({ ok: false, error: "INVALID_FX" });
    }
  });
  it("rejects amounts the table would reject", () => {
    for (const amountCents of [0, -1, 1.5, NaN, 2_147_483_648]) {
      expect(toPenCents({ amountCents, currency: "PEN" })).toEqual({ ok: false, error: "INVALID_AMOUNT" });
    }
    expect(toPenCents({ amountCents: 2_147_483_647, currency: "PEN" }).ok).toBe(true);
  });
});

describe("summarizeEntries", () => {
  const entries = [
    entry({ kind: "income", amountPenCents: 100_000, occurredOn: "2027-01-10", unitId: "u1" }),
    entry({ kind: "income", amountPenCents: 50_000, occurredOn: "2027-02-03", unitId: "u2" }),
    entry({ kind: "expense", amountPenCents: 20_000, occurredOn: "2027-01-20", unitId: "u1" }),
    entry({ kind: "expense", amountPenCents: 5_000, occurredOn: "2027-02-10", unitId: null }),
    entry({ kind: "expense", amountPenCents: 8_000, occurredOn: "2027-02-11", unitId: null, categoryId: "c-clean", categoryKey: "cleaning" }),
  ];

  it("totals income, expense, net and margin", () => {
    const r = summarizeEntries(entries);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary).toMatchObject({ incomeCents: 150_000, expenseCents: 33_000, netCents: 117_000, marginBps: 7800 });
  });

  it("groups by month in order, by category by size and by unit with general last", () => {
    const r = summarizeEntries(entries);
    if (!r.ok) throw new Error("expected ok");
    expect(r.summary.byMonth.map((m) => [m.month, m.netCents])).toEqual([
      ["2027-01", 80_000],
      ["2027-02", 37_000],
    ]);
    expect(r.summary.byCategory.map((c) => [c.categoryId, c.totalCents])).toEqual([
      ["c-rental", 150_000],
      ["c-water", 25_000],
      ["c-clean", 8_000],
    ]);
    expect(r.summary.byUnit.map((u) => [u.unitId, u.netCents])).toEqual([
      ["u1", 80_000],
      ["u2", 50_000],
      [null, -13_000],
    ]);
  });

  it("orders categories with equal totals by id", () => {
    const tied = [
      entry({ kind: "expense", amountPenCents: 100, categoryId: "b", categoryKey: null }),
      entry({ kind: "expense", amountPenCents: 100, categoryId: "a", categoryKey: null }),
    ];
    const r = summarizeEntries(tied);
    if (!r.ok) throw new Error("expected ok");
    expect(r.summary.byCategory.map((c) => c.categoryId)).toEqual(["a", "b"]);
  });

  it("puts the general bucket last whichever order entries arrive in", () => {
    const first = [
      entry({ kind: "expense", amountPenCents: 1, unitId: null }),
      entry({ kind: "expense", amountPenCents: 1, unitId: "z" }),
      entry({ kind: "expense", amountPenCents: 1, unitId: "a" }),
    ];
    const r = summarizeEntries(first);
    if (!r.ok) throw new Error("expected ok");
    expect(r.summary.byUnit.map((u) => u.unitId)).toEqual(["a", "z", null]);
  });

  it("filters by an inclusive date range, with either bound open", () => {
    const both = summarizeEntries(entries, { from: "2027-02-01", to: "2027-02-10" });
    const onlyFrom = summarizeEntries(entries, { from: "2027-02-04" });
    const onlyTo = summarizeEntries(entries, { to: "2027-01-10" });
    if (!both.ok || !onlyFrom.ok || !onlyTo.ok) throw new Error("expected ok");
    expect(both.summary.incomeCents).toBe(50_000);
    expect(both.summary.expenseCents).toBe(5_000);
    expect(onlyFrom.summary.expenseCents).toBe(13_000);
    expect(onlyTo.summary).toMatchObject({ incomeCents: 100_000, expenseCents: 0, marginBps: 10_000 });
  });

  it("returns zeros and no margin for no income", () => {
    const empty = summarizeEntries([]);
    const costsOnly = summarizeEntries([entry({ kind: "expense", amountPenCents: 500 })]);
    if (!empty.ok || !costsOnly.ok) throw new Error("expected ok");
    expect(empty.summary).toMatchObject({ incomeCents: 0, expenseCents: 0, netCents: 0, marginBps: null });
    expect(empty.summary.byMonth).toEqual([]);
    expect(costsOnly.summary).toMatchObject({ netCents: -500, marginBps: null });
  });

  it("rounds the margin half away from zero", () => {
    const positive = summarizeEntries([
      entry({ kind: "income", amountPenCents: 32 }),
      entry({ kind: "expense", amountPenCents: 31 }),
    ]);
    const negative = summarizeEntries([
      entry({ kind: "income", amountPenCents: 32 }),
      entry({ kind: "expense", amountPenCents: 33 }),
    ]);
    if (!positive.ok || !negative.ok) throw new Error("expected ok");
    expect(positive.summary.marginBps).toBe(313); // 312.5 -> 313
    expect(negative.summary.marginBps).toBe(-313); // -312.5 -> -313
  });

  it("accepts a stored amount of zero (1 cent at a rate below 0.5)", () => {
    const tiny = toPenCents({ amountCents: 1, currency: "USD", fxRatePen: "0.499999" });
    expect(tiny).toEqual({ ok: true, cents: 0 });
    const r = summarizeEntries([entry({ kind: "income", amountPenCents: 0 }), entry({ kind: "expense", amountPenCents: 5 })]);
    if (!r.ok) throw new Error("expected ok");
    expect(r.summary).toMatchObject({ incomeCents: 0, expenseCents: 5, netCents: -5, marginBps: null });
    expect(rentalProfits([entry({ kind: "income", amountPenCents: 0, stayStart: "2027-01-01", stayEnd: "2027-01-02" })]).ok).toBe(true);
  });

  it("rejects negative or non-integer stored amounts", () => {
    for (const amountPenCents of [-5, 1.5, NaN]) {
      expect(summarizeEntries([entry({ kind: "income", amountPenCents })])).toEqual({ ok: false, error: "INVALID_AMOUNT" });
    }
  });

  it("fails instead of rounding past the safe integer limit", () => {
    const huge = Number.MAX_SAFE_INTEGER;
    const r = summarizeEntries([entry({ kind: "income", amountPenCents: huge }), entry({ kind: "income", amountPenCents: huge })]);
    expect(r).toEqual({ ok: false, error: "AMOUNT_OVERFLOW" });
  });

  it("does not swallow unexpected errors", () => {
    const poisoned = [{ ...entry({ kind: "income", amountPenCents: 1 }), get amountPenCents(): number { throw new Error("boom"); } }];
    expect(() => summarizeEntries(poisoned)).toThrow("boom");
  });
});

describe("rentalProfits", () => {
  const rental = entry({
    kind: "income", amountPenCents: 80_000, unitId: "u1", categoryId: "c-rental", categoryKey: "rental",
    stayStart: "2027-02-01", stayEnd: "2027-02-04", occurredOn: "2027-02-03",
  });
  const commission = entry({
    kind: "expense", amountPenCents: 12_000, relatedEntryId: rental.id, categoryId: "c-comm", categoryKey: "platform_commission",
  });
  const cleaning = entry({ kind: "expense", amountPenCents: 8_000, relatedEntryId: rental.id, categoryId: "c-clean", categoryKey: "cleaning" });
  const laundry = entry({ kind: "expense", amountPenCents: 1_500, relatedEntryId: rental.id, categoryId: "c-laundry", categoryKey: null });

  it("computes gross, commission, other costs and net for a rental", () => {
    const r = rentalProfits([rental, commission, cleaning, laundry]);
    if (!r.ok) throw new Error("expected ok");
    expect(r.rentals).toEqual([
      {
        rentalId: rental.id, unitId: "u1", stayStart: "2027-02-01", stayEnd: "2027-02-04", nights: 3,
        grossCents: 80_000, commissionCents: 12_000, otherCostsCents: 9_500, netCents: 58_500,
      },
    ]);
  });

  it("reports a rental with no costs and ignores unlinked or non-rental entries", () => {
    const direct = entry({ kind: "income", amountPenCents: 30_000, stayStart: "2027-01-05", stayEnd: "2027-01-06" });
    const service = entry({ kind: "income", amountPenCents: 999 }); // income without a stay
    const standalone = entry({ kind: "expense", amountPenCents: 4_000 });
    const r = rentalProfits([rental, service, standalone, direct]);
    if (!r.ok) throw new Error("expected ok");
    expect(r.rentals.map((x) => [x.rentalId, x.netCents, x.nights])).toEqual([
      [direct.id, 30_000, 1],
      [rental.id, 80_000, 3],
    ]);
  });

  it("orders same-day stays by id and allows a negative net", () => {
    const a = entry({ kind: "income", amountPenCents: 1_000, stayStart: "2027-03-01", stayEnd: "2027-03-02" });
    const b = entry({ kind: "income", amountPenCents: 1_000, stayStart: "2027-03-01", stayEnd: "2027-03-02" });
    const loss = entry({ kind: "expense", amountPenCents: 3_000, relatedEntryId: b.id });
    const r = rentalProfits([b, loss, a]);
    if (!r.ok) throw new Error("expected ok");
    expect(r.rentals.map((x) => [x.rentalId, x.netCents])).toEqual([[a.id, 1_000], [b.id, -2_000]]);
  });

  it("keeps duplicate rows in a stable order", () => {
    const dup = entry({ kind: "income", amountPenCents: 10, stayStart: "2027-04-01", stayEnd: "2027-04-02" });
    const r = rentalProfits([dup, { ...dup }]);
    if (!r.ok) throw new Error("expected ok");
    expect(r.rentals).toHaveLength(2);
  });

  it("rejects invalid amounts and overflow", () => {
    expect(rentalProfits([entry({ kind: "income", amountPenCents: -1 })])).toEqual({ ok: false, error: "INVALID_AMOUNT" });
    const big = Number.MAX_SAFE_INTEGER;
    const r = entry({ kind: "income", amountPenCents: 10, stayStart: "2027-03-01", stayEnd: "2027-03-02" });
    const c1 = entry({ kind: "expense", amountPenCents: big, relatedEntryId: r.id });
    const c2 = entry({ kind: "expense", amountPenCents: big, relatedEntryId: r.id });
    expect(rentalProfits([r, c1, c2])).toEqual({ ok: false, error: "AMOUNT_OVERFLOW" });
  });
});

describe("nightsBetween", () => {
  it("counts nights in [start, end) across months and leap days", () => {
    expect(nightsBetween("2027-01-30", "2027-02-02")).toBe(3);
    expect(nightsBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(nightsBetween("2027-05-01", "2027-05-02")).toBe(1);
  });
});
