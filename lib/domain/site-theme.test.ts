import { describe, it, expect } from "vitest";
import {
  PRESETS,
  PRESET_IDS,
  contrastRatio,
  contrastWarnings,
  deriveTints,
  foregroundFor,
  mixHex,
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

describe("custom hex colors", () => {
  it("accepts any #rrggbb, normalizes case and keeps the preset's other fields", () => {
    const theme = resolveTheme({ preset: "selva", primary: "#a1b2c3", background: "#ffffff" });
    expect(theme.primary).toBe("#A1B2C3");
    expect(theme.background).toBe("#FFFFFF");
    expect(theme.accent).toBe(PRESETS.selva.accent);
    expect(theme.fontPair).toBe(PRESETS.selva.fontPair);
  });

  it.each(["#abc", "#12345g", "123456", "#1234567", "rgb(0,0,0)", "var(--x)", " #123456", "#123456\n"])(
    "rejects %j and falls back to the default theme",
    (bad) => {
      expect(resolveTheme({ primary: bad })).toEqual(resolveTheme({}));
    },
  );

  it("keeps button and body text legible even for a poor custom choice", () => {
    for (const color of ["#FFFF00", "#808080", "#777777", "#FF69B4", "#F5E6C8", "#000000", "#FFFFFF"]) {
      const vars = themeToCssVars(resolveTheme({ primary: color, accent: color, background: color }));
      expect(contrastRatio(color, vars["--site-primary-fg"])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(color, vars["--site-accent-fg"])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(color, vars["--site-fg"])).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("CSS output is closed over a fixed allowlist", () => {
  const HEX = /^#[0-9A-F]{6}$/;
  const attempts: unknown[] = [
    { primary: "red;}body{display:none" },
    { primary: "#000000;} body{x:y", accent: "#fff\"}</style><script>alert(1)</script>" },
    { background: "url(https://evil.example/x.png)" },
    { fontPair: "x;}*{color:red", radius: "9999px", preset: "__proto__" },
    { primary: "expression(alert(1))", accent: "@import 'x'" },
    { constructor: { prototype: { primary: "#000000;" } } },
    JSON.parse('{"__proto__": {"primary": "red"}}'),
  ];

  it("emits only known --site-* names with hex or fixed-token values", () => {
    const names = Object.keys(themeToCssVars(resolveTheme({}))).sort();
    for (const raw of attempts) {
      const vars = themeToCssVars(resolveTheme(raw));
      expect(Object.keys(vars).sort()).toEqual(names);
      for (const value of Object.values(vars)) {
        expect(value).toMatch(/^(#[0-9A-F]{6}|[0-9.]+rem|var\(--font-[a-z-]+\))$/);
      }
    }
    expect(HEX.test(themeToCssVars(resolveTheme({ primary: "#a1b2c3" }))["--site-primary"])).toBe(true);
  });
});

describe("derived tints", () => {
  it("mixHex matches color-mix(in srgb) arithmetic", () => {
    expect(mixHex("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mixHex("#FF0000", "#0000FF", 1)).toBe("#FF0000");
    expect(mixHex("#FF0000", "#0000FF", 0)).toBe("#0000FF");
  });

  it("muted text stays AA on the background and the surface for every preset", () => {
    for (const id of PRESET_IDS) {
      const { background } = resolveTheme({ preset: id });
      const { muted, surface } = deriveTints(background, foregroundFor(background));
      expect(contrastRatio(muted, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(muted, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("muted text stays AA for any custom background, falling back to full foreground", () => {
    const steps = [0, 51, 102, 128, 153, 187, 204, 255];
    for (const r of steps)
      for (const g of steps)
        for (const b of steps) {
          const bg = mixHex(`#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`, "#000000", 1);
          const { muted, surface } = deriveTints(bg, foregroundFor(bg));
          expect(contrastRatio(muted, bg)).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(muted, surface)).toBeGreaterThanOrEqual(4.5);
        }
  });
});

describe("tenant brands", () => {
  // Mirrors the themes in supabase/seed.sql: the only thing that differs per tenant.
  const saywa = themeToCssVars(resolveTheme({ preset: "andino" }));
  const demo = themeToCssVars(resolveTheme({ preset: "costa" }));

  it("gives saywa-lodges and demo different brands from the theme alone", () => {
    for (const key of ["--site-primary", "--site-accent", "--site-bg", "--site-font-heading", "--site-radius"]) {
      expect(saywa[key]).not.toBe(demo[key]);
    }
  });

  it("is deterministic per tenant (no state shared between resolutions)", () => {
    resolveTheme({ preset: "costa", primary: "#010203" });
    expect(themeToCssVars(resolveTheme({ preset: "andino" }))).toEqual(saywa);
    expect(themeToCssVars(resolveTheme({ preset: "costa" }))).toEqual(demo);
  });
});
