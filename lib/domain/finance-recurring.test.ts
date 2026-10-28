import { describe, it, expect } from "vitest";
import {
  centsToText,
  confirmFormSchema,
  dueDate,
  overdueMonths,
  pendingForMonth,
  templateFormSchema,
  type RecurringTemplate,
} from "./finance-recurring";

const CAT = "0bcf73ac-1c1d-4418-9982-2edde9a3e50c";
const ID = "ee204001-0000-4000-8000-000000000001";

const tpl = (over: Partial<RecurringTemplate> & Pick<RecurringTemplate, "id" | "name">): RecurringTemplate => ({
  categoryId: CAT, unitId: null, dayOfMonth: 10, estimatedCents: 5000, currency: "PEN", counterparty: null,
  paymentMethod: null, active: true, startsMonth: "2027-01", ...over,
});

describe("centsToText", () => {
  it("writes cents as a decimal money input", () => {
    expect(centsToText(6120)).toBe("61.20");
    expect(centsToText(5)).toBe("0.05");
    expect(centsToText(100000)).toBe("1000.00");
  });
});

describe("dueDate", () => {
  it("pads the day", () => {
    expect(dueDate("2027-03", 5)).toBe("2027-03-05");
    expect(dueDate("2027-12", 28)).toBe("2027-12-28");
  });
});

describe("pendingForMonth", () => {
  const water = tpl({ id: "w", name: "Agua", dayOfMonth: 10 });
  const power = tpl({ id: "p", name: "Luz", dayOfMonth: 5 });
  const net = tpl({ id: "n", name: "Internet", dayOfMonth: 10 });

  it("lists the unconfirmed ones ordered by due date, then name", () => {
    const list = pendingForMonth([water, power, net], new Set(), "2027-03", "2027-03");
    expect(list.map((p) => [p.template.id, p.dueOn, p.month])).toEqual([
      ["p", "2027-03-05", "2027-03"],
      ["w", "2027-03-10", "2027-03"],
      ["n", "2027-03-10", "2027-03"],
    ]);
  });

  it("orders the same whatever the input order, and keeps twins", () => {
    const twin = tpl({ id: "t2", name: "Agua", dayOfMonth: 10 });
    const forward = pendingForMonth([power, water, twin], new Set(), "2027-03", "2027-03").map((p) => p.template.id);
    const backward = pendingForMonth([twin, water, power], new Set(), "2027-03", "2027-03").map((p) => p.template.id);
    expect(forward[0]).toBe("p");
    expect(new Set(forward.slice(1))).toEqual(new Set(["w", "t2"]));
    expect(backward[0]).toBe("p");
    expect(backward).toHaveLength(3);
  });

  it("drops the confirmed, the paused and the ones that have not started", () => {
    const paused = tpl({ id: "x", name: "Pausado", active: false });
    const later = tpl({ id: "y", name: "Futuro", startsMonth: "2027-04" });
    expect(pendingForMonth([water, paused, later], new Set(["w"]), "2027-03", "2027-03")).toEqual([]);
    expect(pendingForMonth([later], new Set(), "2027-04", "2027-04")).toHaveLength(1);
  });

  it("never offers a month that has not begun or an invalid one", () => {
    expect(pendingForMonth([water], new Set(), "2027-04", "2027-03")).toEqual([]);
    expect(pendingForMonth([water], new Set(), "garbage", "2027-03")).toEqual([]);
    expect(pendingForMonth([water], new Set(), "2027-02", "2027-03")).toHaveLength(1); // a past month is still pending
  });
});

describe("overdueMonths", () => {
  const water = tpl({ id: "w", name: "Agua", startsMonth: "2027-01" });
  it("finds past months with something still pending, most recent first", () => {
    const confirmed = new Map<string, Set<string>>([["2027-03", new Set(["w"])]]);
    expect(overdueMonths([water], confirmed, "2027-04")).toEqual(["2027-02", "2027-01"]);
  });
  it("is empty when everything is confirmed or nothing started, and respects the limit", () => {
    expect(overdueMonths([water], new Map(), "2027-01")).toEqual([]);
    expect(overdueMonths([water], new Map(), "2027-12", 2)).toEqual(["2027-11", "2027-10"]);
  });
});

describe("templateFormSchema", () => {
  const ok = { name: " Agua ", categoryId: CAT, unitId: "", dayOfMonth: "10", amount: "61.20", currency: "PEN", counterparty: "", paymentMethod: "" };
  it("parses text fields into cents and numbers, blank optionals into undefined", () => {
    const r = templateFormSchema.safeParse(ok);
    expect(r.success && r.data).toMatchObject({ name: "Agua", dayOfMonth: 10, amount: 6120, currency: "PEN", unitId: undefined, counterparty: undefined });
  });
  it("rejects a bad day, name, amount or category", () => {
    for (const bad of [{ dayOfMonth: "29" }, { dayOfMonth: "0" }, { dayOfMonth: "x" }, { name: "  " }, { name: "a".repeat(121) }, { amount: "0" }, { categoryId: "nope" }, { currency: "EUR" }]) {
      expect(templateFormSchema.safeParse({ ...ok, ...bad }).success).toBe(false);
    }
  });
});

describe("confirmFormSchema", () => {
  const ok = { recurringId: ID, month: "2027-03-01", amount: "61.20", currency: "PEN", fxRate: "", occurredOn: "" };
  it("accepts the real amount, with the template day as the default date", () => {
    const r = confirmFormSchema.safeParse(ok);
    expect(r.success && r.data).toMatchObject({ amount: 6120, occurredOn: undefined, fxRate: undefined });
  });
  it("needs a rate for dollars and refuses one for soles", () => {
    expect(confirmFormSchema.safeParse({ ...ok, currency: "USD" }).success).toBe(false);
    expect(confirmFormSchema.safeParse({ ...ok, currency: "USD", fxRate: "3,75" }).success).toBe(true);
    expect(confirmFormSchema.safeParse({ ...ok, fxRate: "3.75" }).success).toBe(false);
  });
  it("keeps the date inside the month and the month on its first day", () => {
    expect(confirmFormSchema.safeParse({ ...ok, occurredOn: "2027-03-31" }).success).toBe(true);
    expect(confirmFormSchema.safeParse({ ...ok, occurredOn: "2027-04-01" }).success).toBe(false);
    expect(confirmFormSchema.safeParse({ ...ok, occurredOn: "2027-02-28" }).success).toBe(false);
    const mid = confirmFormSchema.safeParse({ ...ok, month: "2027-03-15" });
    expect(mid.success).toBe(false);
    expect(confirmFormSchema.safeParse({ ...ok, month: "2027-13-01" }).success).toBe(false);
  });
});
