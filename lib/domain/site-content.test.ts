import { describe, it, expect } from "vitest";
import { pick, resolveContent } from "./site-content";

describe("resolveContent", () => {
  it("parses valid localized copy", () => {
    const content = resolveContent({
      headline: { en: "Country house", es: "Casa de campo" },
      capacity: 13,
      faq: [{ question: { en: "Pets?", es: "¿Mascotas?" }, answer: { en: "Yes", es: "Sí" } }],
    });
    expect(content.capacity).toBe(13);
    expect(content.faq).toHaveLength(1);
  });

  it("falls back to empty copy for invalid shapes instead of throwing", () => {
    expect(resolveContent(null)).toEqual({});
    expect(resolveContent({ headline: "not localized" })).toEqual({});
    expect(resolveContent({ capacity: -3 })).toEqual({});
  });

  it("rejects oversized fields", () => {
    expect(resolveContent({ headline: { en: "x".repeat(500), es: "x" } })).toEqual({});
  });
});

describe("pick", () => {
  it("returns the requested language, or empty for missing copy", () => {
    expect(pick({ en: "Hi", es: "Hola" }, "es")).toBe("Hola");
    expect(pick({ en: "Hi", es: "Hola" }, "en")).toBe("Hi");
    expect(pick(undefined, "es")).toBe("");
  });
});
