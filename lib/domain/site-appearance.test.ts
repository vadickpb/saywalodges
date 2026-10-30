import { describe, expect, it } from "vitest";
import { PRESETS, resolveTheme } from "./site-theme";
import { MAX_PAYLOAD_CHARS, normalizeContent, parseAppearancePayload, themeToStored } from "./site-appearance";

const pair = (es: string, en: string) => ({ es, en });
const payload = (theme: unknown, content: unknown = {}) => JSON.stringify({ theme, content });

describe("themeToStored", () => {
  it("stores only the preset when nothing was customized", () => {
    expect(themeToStored(resolveTheme({ preset: "costa" }))).toEqual({ preset: "costa" });
  });

  it("stores only the fields that differ from the preset, with uppercase hex", () => {
    const theme = resolveTheme({ preset: "andino", primary: "#112233", radius: "round" });
    expect(themeToStored(theme)).toEqual({ preset: "andino", primary: "#112233", radius: "round" });
  });

  it("does not store a color typed in lowercase when it equals the preset", () => {
    const theme = resolveTheme({ preset: "selva", primary: PRESETS.selva.primary.toLowerCase() });
    expect(themeToStored(theme)).toEqual({ preset: "selva" });
  });

  it("round-trips through resolveTheme", () => {
    const theme = resolveTheme({ preset: "noche", accent: "#00FF00", fontPair: "classic", background: "#101010" });
    expect(resolveTheme(themeToStored(theme))).toEqual(theme);
  });
});

describe("normalizeContent", () => {
  it("trims, and drops localized fields that are empty in both languages", () => {
    const out = normalizeContent({ headline: pair("  Hola ", " Hi "), tagline: pair(" ", ""), region: pair("", "Cusco") });
    expect(out).toEqual({ headline: pair("Hola", "Hi"), region: pair("", "Cusco") });
  });

  it("drops empty highlight and FAQ rows but keeps half-filled ones for validation", () => {
    const out = normalizeContent({
      highlights: [pair("", ""), pair("Vista", "View")],
      faq: [
        { question: pair("", ""), answer: pair("", "") },
        { question: pair("¿Wifi?", ""), answer: pair("Sí", "Yes") },
      ],
    });
    expect(out.highlights).toEqual([pair("Vista", "View")]);
    expect(out.faq).toHaveLength(1);
  });

  it("omits empty lists and keeps capacity", () => {
    expect(normalizeContent({ highlights: [], faq: [], capacity: 8 })).toEqual({ capacity: 8 });
  });
});

describe("parseAppearancePayload", () => {
  it("accepts a valid draft and returns the stored theme and cleaned content", () => {
    const result = parseAppearancePayload(
      payload(
        { preset: "costa", primary: "#0e4d64" },
        { headline: pair("Hola", "Hi"), faq: [{ question: pair("¿Wifi?", "Wifi?"), answer: pair("Sí", "Yes") }] }
      )
    );
    expect(result).toMatchObject({ ok: true, data: { theme: { preset: "costa" } } });
    if (result.ok) expect(result.data.content.faq).toHaveLength(1);
  });

  it.each([
    ["not a string", 42],
    ["empty", ""],
    ["not JSON", "{nope"],
    ["JSON array", "[]"],
    ["oversized", "x".repeat(MAX_PAYLOAD_CHARS + 1)],
  ])("rejects a payload that is %s", (_name, raw) => {
    expect(parseAppearancePayload(raw)).toEqual({ ok: false, paths: ["payload"] });
  });

  it.each(["red", "#FFF", "#12345G", "url(javascript:alert(1))", "#1234567", ""])(
    "rejects arbitrary or malformed color %j",
    (primary) => {
      const result = parseAppearancePayload(payload({ preset: "andino", primary }));
      expect(result).toEqual({ ok: false, paths: ["theme.primary"] });
    }
  );

  it("rejects unknown preset, font pair and radius", () => {
    const result = parseAppearancePayload(payload({ preset: "x", fontPair: "comic", radius: "9px" }));
    expect(result).toEqual({ ok: false, paths: ["theme.preset", "theme.fontPair", "theme.radius"] });
  });

  it("never stores unknown theme keys (no free-form CSS)", () => {
    const result = parseAppearancePayload(payload({ preset: "andino", customCss: "body{display:none}", __proto__: { x: 1 } }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(Object.keys(result.data.theme)).toEqual(["preset"]);
  });

  it("requires FAQ rows and highlights to be complete in both languages", () => {
    const result = parseAppearancePayload(
      payload(
        {},
        { highlights: [pair("Vista", "")], faq: [{ question: pair("¿Wifi?", "Wifi?"), answer: pair("Sí", "") }] }
      )
    );
    expect(result).toEqual({ ok: false, paths: ["content.highlights.0", "content.faq.0.answer"] });
  });

  it("enforces the domain limits (12 FAQ, 6 highlights, text length)", () => {
    const row = { question: pair("a", "a"), answer: pair("b", "b") };
    expect(parseAppearancePayload(payload({}, { faq: Array(13).fill(row) }))).toMatchObject({ ok: false });
    expect(parseAppearancePayload(payload({}, { highlights: Array(7).fill(pair("a", "a")) }))).toMatchObject({ ok: false });
    expect(parseAppearancePayload(payload({}, { headline: pair("x".repeat(161), "") }))).toMatchObject({ ok: false });
    expect(parseAppearancePayload(payload({}, { capacity: 0 }))).toMatchObject({ ok: false });
    expect(parseAppearancePayload(payload({}, { faq: Array(12).fill(row) }))).toMatchObject({ ok: true });
  });

  it("returns contrast warnings without rejecting a low-contrast theme", () => {
    const result = parseAppearancePayload(payload({ preset: "andino", primary: "#EEEEEE", accent: "#FAF7F1" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings.map((w) => w.pair)).toEqual(["primary", "accent"]);
  });

  it("returns no warnings for the shipped presets", () => {
    for (const preset of Object.keys(PRESETS)) {
      const result = parseAppearancePayload(payload({ preset }));
      expect(result).toMatchObject({ ok: true, warnings: [] });
    }
  });
});
