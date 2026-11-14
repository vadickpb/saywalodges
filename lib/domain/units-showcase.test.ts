import { describe, expect, it } from "vitest";
import { showcaseFacts, showcaseSectionTitle, showcaseTypeLabel } from "./units-showcase";

describe("unit showcase copy", () => {
  it("chooses a section title from the complete set of types", () => {
    expect(showcaseSectionTitle(["house", "house"], "es")).toBe("Casas disponibles");
    expect(showcaseSectionTitle(["apartment", "apartment"], "en")).toBe("Available apartments");
    expect(showcaseSectionTitle(["house", "room"], "es")).toBe("Alojamientos disponibles");
    expect(showcaseSectionTitle([], "en")).toBe("Available stays");
  });

  it("localizes every public type", () => {
    expect(showcaseTypeLabel("villa", "es")).toBe("Villa completa");
    expect(showcaseTypeLabel("room", "en")).toBe("Room");
  });

  it("formats singulars, plurals and optional bed details", () => {
    expect(showcaseFacts({ maxGuests: 1, bedrooms: 1, beds: 2, bathrooms: 1, bedDetails: "1 queen + 1 single" }, "en"))
      .toEqual(["1 guest", "1 bedroom", "2 beds · 1 queen + 1 single", "1 bathroom"]);
    expect(showcaseFacts({ maxGuests: 6, bedrooms: 2, beds: 1, bathrooms: 2 }, "es"))
      .toEqual(["6 huéspedes", "2 dormitorios", "1 cama", "2 baños"]);
  });
});
