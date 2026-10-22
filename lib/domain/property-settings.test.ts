import { describe, it, expect } from "vitest";
import { propertySettingsSchema } from "./property-settings";

const valid = {
  name: "Saywa Lodges",
  whatsappNumber: "51963416766",
  whatsappMessageEn: "Hi!",
  whatsappMessageEs: "Hola!",
  email: "reservas@saywalodges.com",
  mapsUrl: "https://maps.app.goo.gl/x",
  airbnbUrl: "",
  addressLocality: "Urubamba",
  addressRegion: "Cusco",
  addressCountry: "PE",
  latitude: -13.3162,
  longitude: -72.1263,
  metaTitleEn: "Saywa Lodges",
  metaTitleEs: "Saywa Lodges",
  metaDescriptionEn: "A lodge",
  metaDescriptionEs: "Un lodge",
  metaKeywordsEn: ["lodge"],
  metaKeywordsEs: ["lodge"],
  priceRange: "$$",
  starRating: 4,
  petsAllowed: false,
};

describe("propertySettingsSchema", () => {
  it("accepts a fully valid payload", () => {
    expect(propertySettingsSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a non-empty name", () => {
    const result = propertySettingsSchema.safeParse({ ...valid, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-https mapsUrl, but allows an empty one", () => {
    expect(propertySettingsSchema.safeParse({ ...valid, mapsUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(propertySettingsSchema.safeParse({ ...valid, mapsUrl: "http://example.com" }).success).toBe(false);
    expect(propertySettingsSchema.safeParse({ ...valid, mapsUrl: "" }).success).toBe(true);
  });

  it("rejects anything the DB's case-sensitive https:// CHECK would also reject", () => {
    // The URL parser alone would accept/normalize these — reject them here
    // too, so a mismatch surfaces as an inline field error instead of an
    // opaque DB save failure (properties_maps_url_format is `~ '^https://'`).
    expect(propertySettingsSchema.safeParse({ ...valid, mapsUrl: "HTTPS://example.com" }).success).toBe(false);
    expect(propertySettingsSchema.safeParse({ ...valid, mapsUrl: " https://example.com" }).success).toBe(false);
  });

  it("rejects a malformed email, but allows an empty one", () => {
    expect(propertySettingsSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
    expect(propertySettingsSchema.safeParse({ ...valid, email: "" }).success).toBe(true);
  });

  it("rejects out-of-range coordinates", () => {
    expect(propertySettingsSchema.safeParse({ ...valid, latitude: 999 }).success).toBe(false);
    expect(propertySettingsSchema.safeParse({ ...valid, longitude: -999 }).success).toBe(false);
  });

  it("allows null coordinates and starRating (unset is valid)", () => {
    expect(
      propertySettingsSchema.safeParse({ ...valid, latitude: null, longitude: null, starRating: null }).success
    ).toBe(true);
  });

  it("rejects an out-of-range starRating", () => {
    expect(propertySettingsSchema.safeParse({ ...valid, starRating: 6 }).success).toBe(false);
  });
});
