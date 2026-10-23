import { describe, expect, it } from "vitest";
import { unitInputSchema } from "./units";

const valid = { name: "  Casa completa  ", kind: "entire_place", maxGuests: "13", includedGuests: "13", active: "true" };

describe("unitInputSchema", () => {
  it("trims names and parses capacities and active state", () => {
    expect(unitInputSchema.parse(valid)).toEqual({ name: "Casa completa", kind: "entire_place", maxGuests: 13, includedGuests: 13, active: true });
    expect(unitInputSchema.parse({ ...valid, kind: "room", active: "false" }).active).toBe(false);
  });
  it.each(["", "0", "-1", "1.5", "1e2", "Infinity", "2147483648"])("rejects invalid capacity %s", (value) => {
    expect(unitInputSchema.safeParse({ ...valid, maxGuests: value }).success).toBe(false);
    expect(unitInputSchema.safeParse({ ...valid, includedGuests: value }).success).toBe(false);
  });
  it("rejects included guests above capacity with a field error", () => {
    const result = unitInputSchema.safeParse({ ...valid, includedGuests: "14" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.includedGuests).toBeDefined();
  });
  it("accepts a one-person room and extra-guest capacity", () => {
    expect(unitInputSchema.safeParse({ ...valid, kind: "room", maxGuests: "1", includedGuests: "1" }).success).toBe(true);
    expect(unitInputSchema.safeParse({ ...valid, includedGuests: "2" }).success).toBe(true);
  });
  it.each([{name:" "}, {name:"x".repeat(201)}, {kind:"pool"}, {active:"yes"}])("rejects invalid metadata %o", (patch) => {
    expect(unitInputSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});
