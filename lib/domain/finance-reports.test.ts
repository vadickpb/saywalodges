import { describe, it, expect } from "vitest";
import {
  addDays,
  compareReports,
  globalReport,
  monthReport,
  periodReport,
  prepareReport,
  splitAcrossNights,
  yearReport,
  type PreparedReport,
  type ReportEntry,
  type ReportUnit,
} from "./finance-reports";

let seq = 0;
function entry(over: Partial<ReportEntry> & Pick<ReportEntry, "kind" | "amountPenCents">): ReportEntry {
  seq += 1;
  return {
    id: `e${String(seq).padStart(3, "0")}`,
    categoryId: over.kind === "income" ? "c-rental" : "c-water",
    categoryKey: over.kind === "income" ? "rental" : "water",
    occurredOn: "2027-02-03",
    unitId: null,
    relatedEntryId: null,
    stayStart: null,
    stayEnd: null,
    channel: null,
    ...over,
  };
}
const unit = (over: Partial<ReportUnit> = {}): ReportUnit => ({ id: "u1", name: "Casa", active: true, availableFrom: "2027-01-01", ...over });
function prepare(entries: ReportEntry[], units: ReportUnit[] = [unit()]): PreparedReport {
  const r = prepareReport(entries, units);
  if (!r.ok) throw new Error(`prepare failed: ${r.error}`);
  return r.prepared;
}
const JAN = { from: "2027-01-01", toExclusive: "2027-02-01" };
const FEB = { from: "2027-02-01", toExclusive: "2027-03-01" };
const YEAR = { from: "2027-01-01", toExclusive: "2028-01-01" };

// R1 crosses January→February: 4 nights (30 Jan, 31 Jan, 1 Feb, 2 Feb), paid on 3 Feb.
// 100001 = 25000 x 3 + 25001 (the remainder goes to the last night).
function crossing() {
  const rental = entry({
    kind: "income", amountPenCents: 100001, unitId: "u1", channel: "airbnb", stayStart: "2027-01-30", stayEnd: "2027-02-03",
  });
  const commission = entry({
    kind: "expense", amountPenCents: 12000, relatedEntryId: rental.id, categoryId: "c-comm", categoryKey: "platform_commission",
  });
  const cleaning = entry({
    kind: "expense", amountPenCents: 8002, relatedEntryId: rental.id, categoryId: "c-clean", categoryKey: "cleaning",
  });
  const water = entry({ kind: "expense", amountPenCents: 5000, occurredOn: "2027-02-10" }); // general, no house
  return { rental, commission, cleaning, water, all: [rental, commission, cleaning, water] };
}

describe("helpers", () => {
  it("splits an amount over nights with the remainder on the last one", () => {
    expect(splitAcrossNights(BigInt(100), 3)).toEqual([BigInt(33), BigInt(33), BigInt(34)]);
    expect(splitAcrossNights(BigInt(100001), 4).map(Number)).toEqual([25000, 25000, 25000, 25001]);
    expect(splitAcrossNights(BigInt(7), 1).map(Number)).toEqual([7]);
    expect(splitAcrossNights(BigInt(2), 5).map(Number)).toEqual([0, 0, 0, 0, 2]);
    expect(splitAcrossNights(BigInt(0), 3).map(Number)).toEqual([0, 0, 0]);
  });

  it("adds days across month, year and leap-day boundaries", () => {
    expect(addDays("2027-01-31", 1)).toBe("2027-02-01");
    expect(addDays("2027-12-31", 1)).toBe("2028-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
  });
});

describe("prepareReport", () => {
  it("rejects invalid amounts, overflowing totals and absurd stays", () => {
    for (const amountPenCents of [-1, 1.5, NaN]) {
      expect(prepareReport([entry({ kind: "income", amountPenCents })], [])).toEqual({ ok: false, error: "INVALID_AMOUNT" });
    }
    const big = Number.MAX_SAFE_INTEGER;
    expect(prepareReport([entry({ kind: "income", amountPenCents: big }), entry({ kind: "expense", amountPenCents: 1 })], [])).toEqual({
      ok: false,
      error: "AMOUNT_OVERFLOW",
    });
    const forever = entry({ kind: "income", amountPenCents: 10, stayStart: "2027-01-01", stayEnd: "2040-01-01" });
    expect(prepareReport([forever], [])).toEqual({ ok: false, error: "STAY_TOO_LONG" });
  });

  it("rejects a stay with no nights, a backwards stay or a malformed date instead of crashing", () => {
    const stay = (stayStart: string, stayEnd: string) => entry({ kind: "income", amountPenCents: 100, unitId: "u1", stayStart, stayEnd });
    for (const [start, end] of [["2027-02-05", "2027-02-05"], ["2027-02-05", "2027-02-01"], ["garbage", "2027-02-01"], ["2027-02-01", "2027-13-45"]]) {
      expect(prepareReport([stay(start, end)], [])).toEqual({ ok: false, error: "INVALID_STAY" });
    }
  });

  it("accepts totals up to the bound that keeps every ratio exact and rejects just above it", () => {
    const limit = Math.floor(Number.MAX_SAFE_INTEGER / 10_000);
    expect(prepareReport([entry({ kind: "income", amountPenCents: limit })], []).ok).toBe(true);
    expect(prepareReport([entry({ kind: "income", amountPenCents: limit + 1 })], [])).toEqual({ ok: false, error: "AMOUNT_OVERFLOW" });
  });

  it("does not swallow unexpected errors", () => {
    const poisoned = [{ ...entry({ kind: "income", amountPenCents: 1 }), get amountPenCents(): number { throw new Error("boom"); } }];
    expect(() => prepareReport(poisoned, [])).toThrow("boom");
  });
});

describe("a stay that crosses a month boundary", () => {
  const prepared = prepare([...crossing().all]);

  it("stay basis: income and linked costs are spread over the nights", () => {
    const jan = periodReport(prepared, JAN, "stay");
    const feb = periodReport(prepared, FEB, "stay");
    expect(jan.totals).toMatchObject({ incomeCents: 50000, expenseCents: 6000 + 4000, netCents: 40000, marginBps: 8000 });
    expect(feb.totals).toMatchObject({ incomeCents: 50001, expenseCents: 6000 + 4002 + 5000, netCents: 34999, marginBps: 7000 });
    expect(jan.totals.incomeCents + feb.totals.incomeCents).toBe(100001); // nothing lost or invented
  });

  it("cash basis: everything lands whole on its payment date", () => {
    const jan = periodReport(prepared, JAN, "cash");
    const feb = periodReport(prepared, FEB, "cash");
    expect(jan.totals).toMatchObject({ incomeCents: 0, expenseCents: 0, netCents: 0, marginBps: null });
    expect(feb.totals).toMatchObject({ incomeCents: 100001, expenseCents: 12000 + 8002 + 5000, netCents: 100001 - 25002 });
  });

  it("nights, occupancy, ADR and RevPAR are stay-based whichever basis the money uses", () => {
    for (const basis of ["stay", "cash"] as const) {
      const jan = periodReport(prepared, JAN, basis).performance;
      const feb = periodReport(prepared, FEB, basis).performance;
      expect(jan).toEqual({ bookedNights: 2, availableNights: 31, occupancyBps: 645, adrCents: 25000, revparCents: 1613 });
      expect(feb).toEqual({ bookedNights: 2, availableNights: 28, occupancyBps: 714, adrCents: 25001, revparCents: 1786 });
    }
  });

  it("reports per house, by channel and the top expenses", () => {
    const feb = periodReport(prepared, FEB, "stay");
    expect(feb.units[0]).toMatchObject({
      unitId: "u1", incomeCents: 50001, expenseCents: 10002, netCents: 39999, bookedNights: 2, rentals: 1, avgStayNights: 4,
    });
    expect(feb.general).toEqual({ incomeCents: 0, expenseCents: 5000, netCents: -5000 });
    expect(feb.byChannel).toEqual([{ channel: "airbnb", grossCents: 50001, commissionCents: 6000, netCents: 44001, rentals: 1 }]);
    expect(feb.topExpenses.map((c) => [c.categoryId, c.totalCents])).toEqual([
      ["c-comm", 6000],
      ["c-water", 5000],
      ["c-clean", 4002],
    ]);
  });
});

describe("availability", () => {
  const rental = entry({ kind: "income", amountPenCents: 1000, unitId: "u1", stayStart: "2027-02-20", stayEnd: "2027-02-22" });

  it("counts the days from the house's creation, or from its first booked night when history predates it", () => {
    const mid = periodReport(prepare([rental], [unit({ availableFrom: "2027-02-15" })]), FEB, "stay");
    expect(mid.units[0].availableNights).toBe(14); // 15..28 Feb
    // History loaded from before the house was created in the system: the window opens at the first booked night.
    const later = periodReport(prepare([rental], [unit({ availableFrom: "2027-03-10" })]), FEB, "stay");
    expect(later.units[0]).toMatchObject({ availableNights: 9, bookedNights: 2, occupancyBps: 2222 }); // 20..28 Feb
    const early = entry({ kind: "income", amountPenCents: 10000, unitId: "u1", stayStart: "2027-02-01", stayEnd: "2027-02-11" });
    const report = periodReport(prepare([early], [unit({ availableFrom: "2027-02-20" })]), FEB, "stay");
    expect(report.units[0]).toMatchObject({ bookedNights: 10, availableNights: 28, occupancyBps: 3571 }); // never above 100 %
    expect(report.performance.occupancyBps).toBe(3571);
  });

  it("keeps the history of an inactive house instead of erasing it", () => {
    // No declared end: operating until its last booked night (21 Feb) -> 1..21 Feb = 21 nights, 2 booked.
    const off = periodReport(prepare([rental], [unit({ active: false })]), FEB, "stay");
    expect(off.units[0]).toMatchObject({ availableNights: 21, bookedNights: 2, occupancyBps: 952 });
    expect(off.performance).toMatchObject({ bookedNights: 2, availableNights: 21, occupancyBps: 952 });
    // A declared end after the last booking extends the window; one before it never cuts booked nights off.
    expect(periodReport(prepare([rental], [unit({ active: false, availableUntil: "2027-02-25" })]), FEB, "stay").units[0].availableNights).toBe(24);
    expect(periodReport(prepare([rental], [unit({ active: false, availableUntil: "2027-02-10" })]), FEB, "stay").units[0].availableNights).toBe(21);
    // After it stopped operating it contributes nothing, so later months are not diluted.
    const march = periodReport(prepare([rental], [unit({ active: false })]), { from: "2027-03-01", toExclusive: "2027-04-01" }, "stay");
    expect(march.units[0]).toMatchObject({ availableNights: 0, occupancyBps: null });
    // An active house ignores a stale end date.
    expect(periodReport(prepare([rental], [unit({ availableUntil: "2027-02-10" })]), FEB, "stay").units[0].availableNights).toBe(28);
  });

  it("never counts an inactive house with no bookings and no end date", () => {
    const report = periodReport(prepare([], [unit({ active: false })]), FEB, "stay");
    expect(report.units[0]).toMatchObject({ availableNights: 0, occupancyBps: null });
    expect(report.performance.occupancyBps).toBeNull();
    const empty = periodReport(prepare([], [unit({ active: false, availableUntil: "2026-12-01" })]), FEB, "stay");
    expect(empty.units[0].availableNights).toBe(0); // window ended before the period
    const noWindow = periodReport(prepare([], [unit({ active: false, availableUntil: "2027-01-01" })]), FEB, "stay");
    expect(noWindow.units[0].availableNights).toBe(0); // end == start: empty window
  });

  it("returns null ratios for a house with no bookings and keeps houses sorted by name", () => {
    const report = periodReport(prepare([], [unit({ id: "u2", name: "Bosque" }), unit({ id: "u1", name: "Casa" }), unit({ id: "u3", name: "Casa" })]), FEB, "stay");
    expect(report.units.map((u) => u.unitId)).toEqual(["u2", "u1", "u3"]);
    expect(report.units[0]).toMatchObject({ bookedNights: 0, occupancyBps: 0, adrCents: null, avgStayNights: null, rentals: 0 });
    expect(report.performance).toMatchObject({ bookedNights: 0, adrCents: null });
  });

  it("ignores a rental without a house in the per-house figures", () => {
    const orphan = entry({ kind: "income", amountPenCents: 900, unitId: null, stayStart: "2027-02-01", stayEnd: "2027-02-03" });
    const report = periodReport(prepare([orphan]), FEB, "stay");
    expect(report.performance.bookedNights).toBe(0);
    expect(report.general.incomeCents).toBe(900);
  });

  it("books a linked cost on its own house when it has one, spread over its rental's nights", () => {
    const stay = entry({ kind: "income", amountPenCents: 3000, unitId: "u1", stayStart: "2027-02-01", stayEnd: "2027-02-04", channel: "direct" });
    const cleaning = entry({ kind: "expense", amountPenCents: 300, unitId: "u2", relatedEntryId: stay.id, categoryId: "c-clean", categoryKey: "cleaning" });
    const report = periodReport(prepare([stay, cleaning], [unit(), unit({ id: "u2", name: "Anexo" })]), FEB, "stay");
    const byId = Object.fromEntries(report.units.map((u) => [u.unitId, u]));
    expect(byId.u1).toMatchObject({ incomeCents: 3000, expenseCents: 0 });
    expect(byId.u2).toMatchObject({ incomeCents: 0, expenseCents: 300 });
    expect(periodReport(prepare([stay, cleaning], [unit(), unit({ id: "u2", name: "Anexo" })]), { from: "2027-02-04", toExclusive: "2027-03-01" }, "stay").totals.expenseCents).toBe(0);
  });
});

describe("channels, categories and general income", () => {
  it("groups income without a rental under no channel and sorts channels by size", () => {
    const direct = entry({ kind: "income", amountPenCents: 300, unitId: "u1", channel: "direct", stayStart: "2027-02-01", stayEnd: "2027-02-02" });
    const booking = entry({ kind: "income", amountPenCents: 900, unitId: "u1", channel: "booking", stayStart: "2027-02-05", stayEnd: "2027-02-06" });
    const extra = entry({ kind: "income", amountPenCents: 100, categoryId: "c-extra", categoryKey: "extra_services" });
    const tie = entry({ kind: "income", amountPenCents: 100, channel: "other", stayStart: "2027-02-08", stayEnd: "2027-02-09", unitId: "u1" });
    const report = periodReport(prepare([direct, booking, extra, tie]), FEB, "stay");
    expect(report.byChannel.map((c) => [c.channel, c.grossCents, c.rentals])).toEqual([
      ["booking", 900, 1],
      ["direct", 300, 1],
      [null, 100, 0], // ties on size go in code-unit order, "no channel" first
      ["other", 100, 1],
    ]);
  });

  it("keeps only the five biggest expense categories, ties by id", () => {
    const costs = ["a", "b", "c", "d", "e", "f", "g"].map((id, i) =>
      entry({ kind: "expense", amountPenCents: id === "f" || id === "g" ? 50 : 100 + i, categoryId: `c-${id}`, categoryKey: null })
    );
    const report = periodReport(prepare(costs), FEB, "stay");
    expect(report.topExpenses).toHaveLength(5);
    expect(report.topExpenses.map((c) => c.categoryId)).toEqual(["c-e", "c-d", "c-c", "c-b", "c-a"]);
    const ties = periodReport(prepare([entry({ kind: "expense", amountPenCents: 10, categoryId: "z" }), entry({ kind: "expense", amountPenCents: 10, categoryId: "m" })]), FEB, "cash");
    expect(ties.topExpenses.map((c) => c.categoryId)).toEqual(["m", "z"]);
  });

  it("breaks a tie between two named channels by name", () => {
    const a = entry({ kind: "income", amountPenCents: 100, unitId: "u1", channel: "other", stayStart: "2027-02-01", stayEnd: "2027-02-02" });
    const b = entry({ kind: "income", amountPenCents: 100, unitId: "u1", channel: "direct", stayStart: "2027-02-03", stayEnd: "2027-02-04" });
    const report = periodReport(prepare([a, b]), FEB, "stay");
    expect(report.byChannel.map((c) => c.channel)).toEqual(["direct", "other"]);
  });

  it("treats a cost linked to a rental that is not in the data as an ordinary expense", () => {
    const dangling = entry({ kind: "expense", amountPenCents: 450, relatedEntryId: "deleted-rental", categoryId: "c-clean", categoryKey: "cleaning", occurredOn: "2027-02-12" });
    const report = periodReport(prepare([dangling]), FEB, "stay");
    expect(report.totals.expenseCents).toBe(450);
    expect(report.byChannel).toEqual([]);
    expect(periodReport(prepare([dangling]), JAN, "stay").totals.expenseCents).toBe(0);
  });

  it("does not count a commission with no rental in the channel table", () => {
    const loose = entry({ kind: "expense", amountPenCents: 70, categoryId: "c-comm", categoryKey: "platform_commission" });
    const report = periodReport(prepare([loose]), FEB, "cash");
    expect(report.byChannel).toEqual([]);
    expect(report.totals.expenseCents).toBe(70);
  });
});

describe("comparisons", () => {
  const prepared = prepare([...crossing().all]);

  it("compares a month with the previous one and with the same month last year", () => {
    const m = monthReport(prepared, "2027-02", "stay");
    expect(m.vsPreviousMonth.income).toEqual({ cents: 1, pctBps: 0 }); // 50001 vs 50000: +0.002 %
    expect(m.vsPreviousMonth.expense).toEqual({ cents: 5002, pctBps: 5002 }); // 15002 vs 10000
    expect(m.vsPreviousMonth.net).toEqual({ cents: -5001, pctBps: -1250 }); // 34999 vs 40000: -12.50 %
    expect(m.vsPreviousMonth.occupancyPointsBps).toBe(69); // 714 - 645
    expect(m.vsLastYear.income.pctBps).toBeNull(); // nothing a year ago
    expect(m.vsLastYear.occupancyPointsBps).toBeNull();
    expect(m.current.period).toEqual(FEB);
    expect(m.previousMonth.period).toEqual(JAN);
    expect(m.sameMonthLastYear.period).toEqual({ from: "2026-02-01", toExclusive: "2026-03-01" });
  });

  it("rounds percentages away from zero and handles a negative baseline", () => {
    const up = compareReports(
      { ...periodReport(prepared, FEB, "cash"), totals: { incomeCents: 3, expenseCents: 0, netCents: 3, marginBps: null } },
      { ...periodReport(prepared, JAN, "cash"), totals: { incomeCents: 2, expenseCents: 0, netCents: -2, marginBps: null } }
    );
    expect(up.income).toEqual({ cents: 1, pctBps: 5000 });
    expect(up.net).toEqual({ cents: 5, pctBps: 25000 }); // against |-2|
    const down = compareReports(
      { ...periodReport(prepared, FEB, "cash"), totals: { incomeCents: 1, expenseCents: 0, netCents: 1, marginBps: null } },
      { ...periodReport(prepared, JAN, "cash"), totals: { incomeCents: 3, expenseCents: 0, netCents: 3, marginBps: null } }
    );
    expect(down.income).toEqual({ cents: -2, pctBps: -6667 }); // -66.666...% rounds away from zero
  });

  it("rejects an invalid month", () => {
    expect(() => monthReport(prepared, "2027-13", "stay")).toThrow("invalid month");
  });
});

describe("yearReport", () => {
  const prepared = prepare([...crossing().all]);

  it("returns twelve months, the year total and the best and worst active months", () => {
    const y = yearReport(prepared, 2027, "stay");
    expect(y.months).toHaveLength(12);
    expect(y.months[0]).toMatchObject({ month: "2027-01", incomeCents: 50000, netCents: 40000, occupancyBps: 645 });
    expect(y.months[1]).toMatchObject({ month: "2027-02", incomeCents: 50001, netCents: 34999, adrCents: 25001 });
    expect(y.months[2]).toMatchObject({ month: "2027-03", incomeCents: 0, expenseCents: 0, marginBps: null, bookedNights: 0 });
    expect(y.total.totals).toMatchObject({ incomeCents: 100001, expenseCents: 6000 + 4000 + 6000 + 4002 + 5000 });
    expect(y.best).toEqual({ month: "2027-01", netCents: 40000 });
    expect(y.worst).toEqual({ month: "2027-02", netCents: 34999 });
    expect(y.vsPreviousYear.income.pctBps).toBeNull();
    expect(y.previousYear.period).toEqual({ from: "2026-01-01", toExclusive: "2027-01-01" });
  });

  it("gives ties to the earlier month and null best/worst when nothing happened", () => {
    const tie = prepare([
      entry({ kind: "income", amountPenCents: 100, occurredOn: "2027-04-02" }),
      entry({ kind: "income", amountPenCents: 100, occurredOn: "2027-05-02" }),
    ]);
    const y = yearReport(tie, 2027, "cash");
    expect(y.best).toEqual({ month: "2027-04", netCents: 100 });
    expect(y.worst).toEqual({ month: "2027-04", netCents: 100 });
    const empty = yearReport(prepare([]), 2030, "cash");
    expect(empty.best).toBeNull();
    expect(empty.worst).toBeNull();
    expect(empty.months[11].month).toBe("2030-12");
  });
});

describe("globalReport", () => {
  const r1 = entry({ kind: "income", amountPenCents: 100001, unitId: "u1", channel: "airbnb", stayStart: "2027-01-30", stayEnd: "2027-02-03" });
  const c1 = entry({ kind: "expense", amountPenCents: 12000, relatedEntryId: r1.id, categoryId: "c-comm", categoryKey: "platform_commission" });
  const l1 = entry({ kind: "expense", amountPenCents: 8002, relatedEntryId: r1.id, categoryId: "c-clean", categoryKey: "cleaning" });
  const r2 = entry({ kind: "income", amountPenCents: 60000, unitId: "u2", channel: "direct", stayStart: "2027-02-10", stayEnd: "2027-02-12" });
  const l2 = entry({ kind: "expense", amountPenCents: 3000, relatedEntryId: r2.id, categoryId: "c-clean", categoryKey: "cleaning" });
  const r3 = entry({ kind: "income", amountPenCents: 40000, unitId: "u2", channel: "booking", stayStart: "2027-02-20", stayEnd: "2027-02-21" });
  const c3 = entry({ kind: "expense", amountPenCents: 6000, relatedEntryId: r3.id, categoryId: "c-comm", categoryKey: "platform_commission" });
  const m3 = entry({ kind: "expense", amountPenCents: 900, relatedEntryId: r3.id, categoryId: "c-maint", categoryKey: "maintenance" });
  const prepared = prepare([r1, c1, l1, r2, l2, r3, c3, m3], [unit(), unit({ id: "u2", name: "Anexo" })]);

  it("ranks houses, shows the channel mix and what direct bookings save in commission", () => {
    const g = globalReport(prepared, YEAR, "cash");
    // Ranked by NET profit, not revenue: the Anexo earns less gross (100000 vs 100001) but pays far
    // less in costs, so it leads (90100 vs 79999). Cost lines carry their rental's house.
    expect(g.ranking.map((u) => u.unitId)).toEqual(["u2", "u1"]);
    expect(g.ranking[0]).toMatchObject({ incomeCents: 100000, expenseCents: 3000 + 6000 + 900, netCents: 90100 });
    expect(g.ranking[1]).toMatchObject({ incomeCents: 100001, expenseCents: 12000 + 8002, netCents: 79999 });
    expect(g.channelMix.map((c) => [c.channel, c.shareBps])).toEqual([["airbnb", 5000], ["direct", 3000], ["booking", 2000]]);
    // Airbnb 12000/100001 and Booking 6000/40000 -> 18000/140001 = 12.86 % (shown); the estimate uses the exact ratio, one rounding:
    // 60000 x 18000 / 140001 = 7714.2 -> 7714 (rounding the rate first would give 7716).
    expect(g.directSavings).toEqual({ platformCommissionRateBps: 1286, estimatedCents: 7714 });
    expect(g.avgCleaningPerRentalCents).toBe(Math.round((8002 + 3000) / 3)); // 3667
    expect(g.avgMaintenancePerRentalCents).toBe(300); // 900 over 3 rentals
  });

  it("is honest when there is nothing to estimate from", () => {
    const g = globalReport(prepare([]), YEAR, "stay");
    expect(g.directSavings).toEqual({ platformCommissionRateBps: null, estimatedCents: null });
    expect(g.avgCleaningPerRentalCents).toBeNull();
    expect(g.avgMaintenancePerRentalCents).toBeNull();
    expect(g.channelMix).toEqual([]);
    const zero = globalReport(prepare([entry({ kind: "income", amountPenCents: 0 })]), { from: "2027-02-01", toExclusive: "2027-03-01" }, "cash");
    expect(zero.channelMix).toEqual([{ channel: null, grossCents: 0, shareBps: 0 }]);
  });

  it("works on the stay basis and breaks ranking ties by name", () => {
    const a = entry({ kind: "income", amountPenCents: 100, unitId: "ua", stayStart: "2027-02-01", stayEnd: "2027-02-02" });
    const b = entry({ kind: "income", amountPenCents: 100, unitId: "ub", stayStart: "2027-02-01", stayEnd: "2027-02-02" });
    const g = globalReport(prepare([b, a], [unit({ id: "ub", name: "Beta" }), unit({ id: "ua", name: "Alfa" })]), FEB, "stay");
    expect(g.ranking.map((u) => u.name)).toEqual(["Alfa", "Beta"]);
  });
});
