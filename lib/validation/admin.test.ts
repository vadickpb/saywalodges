import { describe, it, expect } from "vitest";
import {
  contentPayloadSchema,
  photosOrderPayloadSchema,
  photoDeletePayloadSchema,
  validateImageFile,
} from "./admin";

// Formalizes the manual verification done during SD-001's security fix
// (zod validation added to /api/admin/* payloads) — see docs/roadmap.md SD-005.

const validProperty = {
  name: "Saywa Lodges",
  whatsappNumber: "51963416766",
  whatsappMessageEn: "hi",
  whatsappMessageEs: "hola",
  email: "reservas@saywalodges.com",
  mapsUrl: "https://maps.app.goo.gl/x",
  airbnbUrl: "",
  addressLocality: "Urubamba",
  addressRegion: "Cusco",
  addressCountry: "PE",
  latitude: -13.3,
  longitude: -72.1,
  metaTitleEn: "t",
  metaTitleEs: "t",
  metaDescriptionEn: "d",
  metaDescriptionEs: "d",
  metaKeywordsEn: ["a"],
  metaKeywordsEs: ["a"],
  priceRange: "$$",
  starRating: 4,
  petsAllowed: false,
};

function payload(propertyOverrides: Partial<typeof validProperty> = {}) {
  return {
    property: { ...validProperty, ...propertyOverrides },
    rooms: [],
    rateTiers: [],
    amenities: [],
    distances: [],
  };
}

describe("contentPayloadSchema", () => {
  it("accepts a real valid payload", () => {
    expect(contentPayloadSchema.safeParse(payload()).success).toBe(true);
  });

  it("rejects a malformed field (wrong type)", () => {
    // @ts-expect-error - deliberately wrong type to test runtime validation
    expect(contentPayloadSchema.safeParse(payload({ name: 123 })).success).toBe(false);
  });

  it("rejects a javascript: URL in mapsUrl", () => {
    expect(
      contentPayloadSchema.safeParse(payload({ mapsUrl: "javascript:alert(1)" })).success
    ).toBe(false);
  });

  it("rejects a javascript: URL in airbnbUrl", () => {
    expect(
      contentPayloadSchema.safeParse(payload({ airbnbUrl: "javascript:alert(1)" })).success
    ).toBe(false);
  });

  it("accepts an empty string for optional URL fields", () => {
    expect(contentPayloadSchema.safeParse(payload({ airbnbUrl: "" })).success).toBe(true);
  });
});

describe("validateImageFile", () => {
  it("rejects SVG", () => {
    const file = new File([new Uint8Array(10)], "evil.svg", { type: "image/svg+xml" });
    expect(validateImageFile(file)).not.toBeNull();
  });

  it("rejects files over 5 MB", () => {
    const file = new File([new Uint8Array(6 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" });
    expect(validateImageFile(file)).not.toBeNull();
  });

  it("accepts a valid jpeg under the size limit", () => {
    const file = new File([new Uint8Array(10)], "ok.jpg", { type: "image/jpeg" });
    expect(validateImageFile(file)).toBeNull();
  });
});

describe("photosOrderPayloadSchema / photoDeletePayloadSchema", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";

  it("rejects a non-uuid id", () => {
    expect(photoDeletePayloadSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
  });

  it("accepts a valid delete payload", () => {
    expect(photoDeletePayloadSchema.safeParse({ id }).success).toBe(true);
  });

  it("accepts a valid order payload", () => {
    expect(photosOrderPayloadSchema.safeParse({ heroId: id, order: [id] }).success).toBe(true);
  });

  it("rejects a non-array order", () => {
    expect(photosOrderPayloadSchema.safeParse({ heroId: null, order: "nope" }).success).toBe(
      false
    );
  });
});
