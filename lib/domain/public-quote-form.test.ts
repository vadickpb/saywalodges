import { describe, expect, it } from "vitest";
import en from "@/dictionaries/en";
import es from "@/dictionaries/es";
import type { PublicQuoteError } from "./public-quote";
import { clampQuoteGuests, quoteErrorText, quoteGuestLimit } from "./public-quote-form";

const units = [{ id: "large", name: "House", maxGuests: 12 }, { id: "small", name: "Room", maxGuests: 2 }];

describe("public quote guest selection", () => {
  it("uses only the selected unit's capacity", () => {
    expect(quoteGuestLimit(units, "large")).toBe(12);
    expect(quoteGuestLimit(units, "small")).toBe(2);
    expect(quoteGuestLimit(units, "other-tenant")).toBe(0);
    expect(quoteGuestLimit([], "")).toBe(0);
  });
  it("reduces the guest count when switching to a smaller unit", () => {
    expect(clampQuoteGuests(10, quoteGuestLimit(units, "small"))).toBe(2);
    expect(clampQuoteGuests(2, quoteGuestLimit(units, "large"))).toBe(2);
    expect(clampQuoteGuests(1, 1)).toBe(1);
    expect(clampQuoteGuests(5, 0)).toBe(1);
  });
});

const errors: PublicQuoteError[] = ["unitNotFound", "invalidDates", "minNights", "capacity", "unavailable", "contact", "tryLater", "validation", "generic"];
for (const [lang, t] of [["en", en.publicQuote], ["es", es.publicQuote]] as const) {
  describe(`public quote error messages (${lang})`, () => {
    it("has no error before submission", () => {
      expect(quoteErrorText({}, t)).toBeNull();
    });
    it.each(errors)("provides a translated fallback for %s", error => {
      expect(quoteErrorText({ error }, t)).toBe(t[error]);
      expect(quoteErrorText({ error }, t)).not.toMatch(/\{\w+\}/);
    });
    it("includes the server's minimum stay and capacity", () => {
      expect(quoteErrorText({ error: "minNights", requiredNights: 3 }, t)).toBe(t.minNightsCount.replace("{n}", "3"));
      expect(quoteErrorText({ error: "capacity", maxGuests: 2 }, t)).toBe(t.capacityCount.replace("{n}", "2"));
    });
    it("ignores unrelated server context", () => {
      expect(quoteErrorText({ error: "unavailable", requiredNights: 8, maxGuests: 12 }, t)).toBe(t.unavailable);
    });
  });
}
