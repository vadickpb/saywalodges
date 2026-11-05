import { describe, expect, it } from "vitest";
import { buildGuideTextParts, WHATSAPP_MESSAGE_LIMIT } from "./house-guide-text";
import type { HouseGuide } from "./house-guide";

const section: HouseGuide["sections"][number] = {
  id: "entry", title: "Llegada", text: "Usa la puerta lateral.\nCierra al salir.",
  steps: ["Abrir el portón", "Guardar la llave"], visible: true,
  images: [{ id: "photo", alt: "Entrada", caption: "Portón azul" }, { id: "legacy", alt: "Llave", caption: "" }],
};
const guide: HouseGuide = { title: "Guía", sections: [section] };

describe("published guide WhatsApp text", () => {
  it("formats visible sections, multiline text, numbered steps and photo references", () => {
    expect(buildGuideTextParts(guide, "es")).toEqual([
      "*Llegada*\nUsa la puerta lateral.\nCierra al salir.\n1. Abrir el portón\n2. Guardar la llave\n(foto: Portón azul)\n(foto: Llave)",
    ]);
  });
  it("localizes photo references without translating owner content", () => {
    expect(buildGuideTextParts(guide, "en")[0]).toContain("(photo: Portón azul)");
    expect(buildGuideTextParts(guide, "en")[0]).toContain("*Llegada*");
  });
  it("omits hidden sections and empty optional fields, preserving section order", () => {
    expect(buildGuideTextParts({ ...guide, sections: [
      { ...section, visible: false, text: "Private draft" },
      { ...section, text: "", images: [], steps: [] },
      { ...section, title: "Salida", text: "Hasta pronto", images: [], steps: [] },
    ] }, "es")).toEqual(["*Llegada*\n\n*Salida*\nHasta pronto"]);
    expect(buildGuideTextParts({ ...guide, sections: [] }, "es")).toEqual([]);
    expect(buildGuideTextParts({ ...guide, sections: [{ ...section, visible: false }] }, "es")).toEqual([]);
  });
  it("keeps exact-limit text in one part and splits longer content at line boundaries", () => {
    const minimal = { ...section, title: "A", images: [], steps: [] };
    expect(buildGuideTextParts({ ...guide, sections: [{ ...minimal, text: "x".repeat(4092) }] }, "es")[0]).toHaveLength(4096);
    const parts = buildGuideTextParts({ ...guide, sections: [{ ...minimal, text: "x".repeat(4093) }] }, "es");
    expect(parts).toEqual(["*A*", "x".repeat(4093)]);
  });
  it("splits oversized words, preserves Unicode and bounds every part", () => {
    const text = "🏡".repeat(6000);
    const parts = buildGuideTextParts({ ...guide, sections: [{ ...section, text, steps: [], images: [] }] }, "es");
    expect(parts.length).toBeGreaterThan(2);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(WHATSAPP_MESSAGE_LIMIT);
      expect(part.isWellFormed()).toBe(true);
    }
    expect(parts.join("\n")).toBe(`*Llegada*\n${text.slice(0,4096)}\n${text.slice(4096,8192)}\n${text.slice(8192)}`);
  });
  it("never appends sharing credentials or URLs", () => {
    const text = buildGuideTextParts(guide, "es").join("\n");
    expect(text).not.toMatch(/https?:|Contraseña:|Password:/);
  });
});
