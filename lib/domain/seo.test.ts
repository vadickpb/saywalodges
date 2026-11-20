import { describe, expect, it } from "vitest";
import { languageAlternates, metaDescription } from "./seo";

describe("metaDescription", () => {
  it("keeps short texts, collapsing whitespace", () => {
    expect(metaDescription("  Villa con\n\npiscina  ")).toBe("Villa con piscina");
  });
  it("cuts long texts at a word boundary, under the limit, with an ellipsis", () => {
    const long = "Hasta 13 huéspedes. La villa más cercana a la piscina, en tres pisos, con 5 habitaciones, 10 camas, 4 baños privados y 1 compartido. Piso 1: habitación con cama doble.";
    const out = metaDescription(long);
    expect(out.length).toBeLessThanOrEqual(158);
    expect(out.endsWith("…")).toBe(true);
    expect(long.startsWith(out.slice(0, -1))).toBe(true);
    expect(out).not.toMatch(/[ ,.]…$/);
  });
  it("cuts a single huge word hard instead of returning nothing", () => {
    expect(metaDescription("x".repeat(400), 50)).toHaveLength(50);
  });
});

describe("languageAlternates", () => {
  it("builds es/en URLs for the home and for a sub-path", () => {
    expect(languageAlternates("https://www.x.pe", "")).toEqual({ languages: { es: "https://www.x.pe/es", en: "https://www.x.pe/en" } });
    expect(languageAlternates("https://www.x.pe", "/alojamientos/1")).toEqual({ languages: { es: "https://www.x.pe/es/alojamientos/1", en: "https://www.x.pe/en/alojamientos/1" } });
  });
});
