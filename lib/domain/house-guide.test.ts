import { describe, expect, it } from "vitest";
import { guideImageSchema, houseGuideSchema, isGuideLinkActive, guidePasswordSchema } from "./house-guide";

const section = { id: "11111111-1111-4111-8111-111111111111", title: "Llegada", text: "Puerta lateral", steps: ["Abrir el portón"], images: [], visible: true };
describe("private house guide", () => {
  it("accepts configurable instructions and requires descriptions for images", () => {
    expect(houseGuideSchema.safeParse({ title: "La casa", sections: [section] }).success).toBe(true);
    expect(houseGuideSchema.safeParse({ title: "La casa", sections: [{ ...section, images: [{ id: section.id, alt: "" }] }] }).success).toBe(false);
  });
  it("preserves the image reference and derives persisted alt text when only a caption is supplied", () => {
    const image = { id: section.id, alt: "", caption: "  Control del portón  " };
    const saved = houseGuideSchema.parse({ title: "Casa", sections: [{ ...section, images: [image] }] });
    expect(saved.sections[0].images[0]).toEqual({ ...image, alt: "Control del portón", caption: "Control del portón" });
    expect(houseGuideSchema.parse(saved)).toEqual(saved);
    expect(guideImageSchema.parse({ ...image, caption: "x".repeat(500) }).alt).toHaveLength(240);
  });
  it("retains legacy alt descriptions when no caption exists", () => {
    expect(guideImageSchema.parse({ id: section.id, alt: "Entrada lateral" })).toEqual({
      id: section.id, alt: "Entrada lateral", caption: "",
    });
    expect(guideImageSchema.safeParse({ id: section.id, alt: " ", caption: " " }).success).toBe(false);
  });
  it("rejects duplicate section identifiers and public image URLs", () => {
    expect(houseGuideSchema.safeParse({ title: "Casa", sections: [section, section] }).success).toBe(false);
    expect(houseGuideSchema.safeParse({ title: "Casa", sections: [{ ...section, images: [{ id: section.id, alt: "Entrada", url: "https://example.com/private.jpg" }] }] }).success).toBe(false);
  });
  it("rejects oversized content and short passwords", () => {
    expect(houseGuideSchema.safeParse({ title: "Casa", sections: [{ ...section, text: "x".repeat(12001) }] }).success).toBe(false);
    expect(guidePasswordSchema.safeParse("12345").success).toBe(false);
    expect(guidePasswordSchema.safeParse("123456").success).toBe(true);
  });
  it("denies expired, revoked and malformed links including the exact expiry", () => {
    const now = Date.parse("2026-11-04T12:00:00Z");
    expect(isGuideLinkActive({ expiresAt: "2026-11-04T12:00:01Z", revokedAt: null }, now)).toBe(true);
    expect(isGuideLinkActive({ expiresAt: "2026-11-04T12:00:00Z", revokedAt: null }, now)).toBe(false);
    expect(isGuideLinkActive({ expiresAt: "2026-11-05T12:00:00Z", revokedAt: "2026-11-04T11:00:00Z" }, now)).toBe(false);
    expect(isGuideLinkActive({ expiresAt: "invalid", revokedAt: null }, now)).toBe(false);
  });
});
