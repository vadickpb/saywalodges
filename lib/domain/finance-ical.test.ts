import { describe, expect, it } from "vitest";
import { completeRentalFormSchema, completeRentalResultSchema } from "./finance-ical";

const BLOCK = "7fc45683-5cf1-4bac-8dde-3331b397956c";
const base = { blockId: BLOCK, amount: "150.50", currency: "PEN", fxRate: "", occurredOn: "2027-03-04", guests: "", cleaning: "" };

describe("completeRentalFormSchema", () => {
  it("turns the typed amount into exact cents and treats blank optionals as absent", () => {
    const parsed = completeRentalFormSchema.parse(base);
    expect(parsed).toMatchObject({ blockId: BLOCK, amount: 15050, currency: "PEN", occurredOn: "2027-03-04" });
    expect(parsed.fxRate).toBeUndefined();
    expect(parsed.guests).toBeUndefined();
    expect(parsed.cleaning).toBeUndefined();
  });

  it("accepts guests and the cleaning cost, and normalizes the rate for dollars", () => {
    const parsed = completeRentalFormSchema.parse({ ...base, currency: "USD", fxRate: "3,75", guests: "4", cleaning: "80" });
    expect(parsed).toMatchObject({ amount: 15050, currency: "USD", fxRate: "3.75", guests: 4, cleaning: 8000 });
  });

  it("requires a rate for dollars and forbids one for soles", () => {
    expect(completeRentalFormSchema.safeParse({ ...base, currency: "USD" }).success).toBe(false);
    expect(completeRentalFormSchema.safeParse({ ...base, fxRate: "3.75" }).success).toBe(false);
  });

  it("rejects missing or invalid amount, date, block, guests and cleaning", () => {
    for (const bad of [
      { amount: "" }, { amount: "0" }, { amount: "-5" }, { amount: "abc" },
      { occurredOn: "" }, { occurredOn: "2027-02-30" },
      { blockId: "not-a-uuid" }, { blockId: "" },
      { guests: "0" }, { guests: "1.5" }, { guests: "1001" },
      { cleaning: "0" }, { cleaning: "-1" }, { currency: "EUR" },
    ]) {
      expect(completeRentalFormSchema.safeParse({ ...base, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("completeRentalResultSchema", () => {
  it("accepts the RPC answer and nothing else", () => {
    expect(completeRentalResultSchema.parse({ rental_id: BLOCK, replayed: false })).toEqual({ rental_id: BLOCK, replayed: false });
    for (const bad of [null, {}, { rental_id: "x", replayed: true }, { rental_id: BLOCK }, { rental_id: BLOCK, replayed: "true" }]) {
      expect(completeRentalResultSchema.safeParse(bad).success).toBe(false);
    }
  });
});
