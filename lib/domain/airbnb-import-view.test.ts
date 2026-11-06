import { describe, expect, it } from "vitest";
import { formatAirbnbTotal } from "./airbnb-import-view";
import { formatPrice } from "./rates-management";

describe("formatAirbnbTotal", () => {
  it("uses the existing finance formatter for ledger currencies", () => {
    expect(formatAirbnbTotal(123456, "PEN")).toBe(formatPrice(123456, "PEN"));
    expect(formatAirbnbTotal(-15000, "USD")).toBe(formatPrice(-15000, "USD"));
  });

  it("keeps payout totals visible for other currency codes", () => {
    expect(formatAirbnbTotal(123456, "EUR")).toBe("EUR 1,234.56");
    expect(formatAirbnbTotal(0, "OTHER")).toBe("OTHER 0.00");
    expect(formatAirbnbTotal(50, "")).toBe("Sin moneda 0.50");
  });
});
