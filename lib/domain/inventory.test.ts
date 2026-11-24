import { describe, expect, it } from "vitest";
import { formatReplacementAmount, parseQuickInventory, parseReplacementCents } from "./inventory";

describe("parseQuickInventory", () => {
  it("parses a leading quantity and defaults to one", () => {
    expect(parseQuickInventory("12 platos\nlicuadora\n  2   almohadas  ")).toEqual({
      ok: true,
      items: [
        { quantity: 12, name: "platos" },
        { quantity: 1, name: "licuadora" },
        { quantity: 2, name: "almohadas" },
      ],
    });
  });

  it("ignores blank lines and preserves numbers that are part of a name", () => {
    expect(parseQuickInventory("\nTV 55 pulgadas\n12platos\r\n0\tvasos\n")).toEqual({
      ok: true,
      items: [
        { quantity: 1, name: "TV 55 pulgadas" },
        { quantity: 1, name: "12platos" },
        { quantity: 0, name: "vasos" },
      ],
    });
  });

  it("reports line numbers instead of partially importing invalid rows", () => {
    expect(parseQuickInventory(`1 plato\n10000 vasos\n${"a".repeat(121)}`)).toEqual({
      ok: false,
      issues: [
        { line: 2, message: "invalid_quantity" },
        { line: 3, message: "name_too_long" },
      ],
    });
  });
});

describe("replacement amount", () => {
  it("parses decimal soles or dollars without floating point rounding", () => {
    expect(parseReplacementCents("12,5")).toBe(1250);
    expect(parseReplacementCents("0.09")).toBe(9);
    expect(formatReplacementAmount(1250)).toBe("12.50");
  });

  it("uses null for an empty field and undefined for invalid input", () => {
    expect(parseReplacementCents(" ")).toBeNull();
    expect(parseReplacementCents("1.234")).toBeUndefined();
    expect(parseReplacementCents("1000000.01")).toBeUndefined();
  });
});
