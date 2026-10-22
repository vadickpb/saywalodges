import { describe, it, expect } from "vitest";
import {
  PRESETS,
  PRESET_IDS,
  contrastRatio,
  contrastWarnings,
  foregroundFor,
  resolveTheme,
  themeToCssVars,
} from "./site-theme";

describe("resolveTheme", () => {
  it("falls back to the default preset for an empty theme", () => {
    expect(resolveTheme({})).toEqual({ preset: "andino", ...PRESETS.andino });
  });

  it("applies a preset and lets individual fields override it", () => {
    const theme = resolveTheme({ preset: "costa", accent: "#123abc" });
    expect(theme.preset).toBe("costa");
    expect(theme.primary).toBe(PRESETS.costa.primary);
    expect(theme.accent).toBe("#123ABC");
  });

  it("rejects anything that isn't a #rrggbb hex, falling back entirely", () => {
    expect(resolveTheme({ primary: "red" })).toEqual(resolveTheme({}));
    expect(resolveTheme({ primary: "#fff" })).toEqual(resolveTheme({}));
  });

  it("never lets a CSS injection attempt through", () => {
    const attempts = [
      { primary: "red;}body{display:none" },
      { accent: "#000000;background:url(https://evil.example)" },
      { fontPair: "editorial;}*{color:red" },
      { radius: "1rem;}" },
      { preset: "andino\"><script>" },
    ];
    for (const raw of attempts) {
      const css = Object.values(themeToCssVars(resolveTheme(raw))).join(" ");
      expect(css).not.toMatch(/[;{}<>]|url\(/);
    }
  });

  it("tolerates non-object input (null, string, array)", () => {
    for (const raw of [null, "andino", [1, 2], 42]) {
      expect(resolveTheme(raw).preset).toBe("andino");
    }
  });
});

describe("contrast", () => {
  it("computes the known WCAG ratio for black on white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  });

  it("picks a legible label color for any background", () => {
    expect(foregroundFor("#FFFF00")).toBe("#000000"); // yellow → dark text
    expect(foregroundFor("#1E3A5F")).toBe("#FFFFFF"); // navy → white text
    // Even a poor tenant choice keeps button labels at AA.
    for (const bg of ["#FFFF00", "#00FF00", "#808080", "#FF69B4", "#2D4A3E"]) {
      expect(contrastRatio(bg, foregroundFor(bg))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("warns when a chosen color is too light to read on the background", () => {
    const warnings = contrastWarnings(resolveTheme({ preset: "andino", accent: "#F5E6C8" }));
    expect(warnings.map((w) => w.pair)).toEqual(["accent"]);
    expect(warnings[0].ratio).toBeLessThan(4.5);
  });

  it("every built-in preset passes AA for its own colors", () => {
    for (const id of PRESET_IDS) {
      expect(contrastWarnings(resolveTheme({ preset: id }))).toEqual([]);
    }
  });
});

describe("themeToCssVars", () => {
  it("emits only --site-* variables", () => {
    const vars = themeToCssVars(resolveTheme({ preset: "noche" }));
    expect(Object.keys(vars).every((k) => k.startsWith("--site-"))).toBe(true);
    expect(vars["--site-fg"]).toBe("#FFFFFF"); // dark preset → light text
  });
});
