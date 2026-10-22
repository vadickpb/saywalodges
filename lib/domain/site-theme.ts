import { z } from "zod";

// Per-tenant theme for the public site template (SD-209). Stored as
// properties.theme (jsonb); this module is the only thing that turns it into
// CSS. Every value that reaches CSS is either a validated #rrggbb hex or a
// fixed string from the maps below — never text from the database — so a
// tenant can't inject CSS through their theme.

export const FONT_PAIRS = ["editorial", "modern", "classic"] as const;
export const RADII = ["sharp", "soft", "round"] as const;
export const PRESET_IDS = ["andino", "costa", "selva", "colonial", "noche"] as const;

export type FontPair = (typeof FONT_PAIRS)[number];
export type Radius = (typeof RADII)[number];
export type PresetId = (typeof PRESET_IDS)[number];

export type ResolvedTheme = {
  preset: PresetId;
  primary: string;
  accent: string;
  background: string;
  fontPair: FontPair;
  radius: Radius;
};

export const PRESETS: Record<PresetId, Omit<ResolvedTheme, "preset">> = {
  // Saywa Lodges' original brand: forest green + Andean gold on warm cream.
  andino: { primary: "#2D4A3E", accent: "#8A5F10", background: "#FAF7F2", fontPair: "editorial", radius: "soft" },
  costa: { primary: "#0E4D64", accent: "#C2410C", background: "#F7FAFB", fontPair: "modern", radius: "round" },
  selva: { primary: "#14532D", accent: "#A16207", background: "#F6F8F3", fontPair: "classic", radius: "soft" },
  colonial: { primary: "#7F1D1D", accent: "#1E3A5F", background: "#FBF8F4", fontPair: "classic", radius: "sharp" },
  noche: { primary: "#E2C88F", accent: "#D97706", background: "#141518", fontPair: "modern", radius: "soft" },
};

const DEFAULT_PRESET: PresetId = "andino";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const themeSchema = z.object({
  preset: z.enum(PRESET_IDS).optional(),
  primary: hex.optional(),
  accent: hex.optional(),
  background: hex.optional(),
  fontPair: z.enum(FONT_PAIRS).optional(),
  radius: z.enum(RADII).optional(),
});

// Never throws: an invalid or partial theme falls back field-by-field to its
// preset (or the default preset), so a bad row degrades to "a valid theme",
// never to a broken page.
export function resolveTheme(raw: unknown): ResolvedTheme {
  const parsed = themeSchema.safeParse(raw);
  const theme = parsed.success ? parsed.data : {};
  const preset = theme.preset ?? DEFAULT_PRESET;
  const base = PRESETS[preset];
  return {
    preset,
    primary: (theme.primary ?? base.primary).toUpperCase(),
    accent: (theme.accent ?? base.accent).toUpperCase(),
    background: (theme.background ?? base.background).toUpperCase(),
    fontPair: theme.fontPair ?? base.fontPair,
    radius: theme.radius ?? base.radius,
  };
}

// ─── WCAG contrast ───────────────────────────────────────────────────────────

function luminance(color: string): number {
  const n = parseInt(color.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT_TEXT = "#FFFFFF";
// Pure black, not a softer near-black: it's the only dark value that keeps
// EVERY possible background at ≥ 4.5:1 against black-or-white (mid-grays sit
// right at the boundary, ~4.58 with #000 vs ~4.45 with #16181D).
const DARK_TEXT = "#000000";

// Picks whichever of near-black/white reads better on `background`, so text
// on any tenant-chosen color stays legible even when the color itself is a
// poor choice.
export function foregroundFor(background: string): string {
  return contrastRatio(background, LIGHT_TEXT) >= contrastRatio(background, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
}

export type ContrastWarning = { pair: "primary" | "accent"; ratio: number };

// The colors a tenant picks are used as text/accents on the page background;
// below AA (4.5:1) the dashboard editor (SD-210) warns. Buttons are safe
// regardless — their label color always comes from foregroundFor().
export function contrastWarnings(theme: ResolvedTheme): ContrastWarning[] {
  const warnings: ContrastWarning[] = [];
  for (const pair of ["primary", "accent"] as const) {
    const ratio = contrastRatio(theme[pair], theme.background);
    if (ratio < 4.5) warnings.push({ pair, ratio: Math.round(ratio * 100) / 100 });
  }
  return warnings;
}

// ─── CSS output ──────────────────────────────────────────────────────────────

const RADIUS_VALUE: Record<Radius, string> = { sharp: "0.25rem", soft: "0.75rem", round: "1.5rem" };

// CSS variable names defined by next/font in app/sites/[host]/[lang]/fonts.ts.
const FONT_VARS: Record<FontPair, { heading: string; body: string }> = {
  editorial: { heading: "var(--font-playfair)", body: "var(--font-inter)" },
  modern: { heading: "var(--font-jakarta)", body: "var(--font-inter)" },
  classic: { heading: "var(--font-lora)", body: "var(--font-source-sans)" },
};

export function themeToCssVars(theme: ResolvedTheme): Record<string, string> {
  const fonts = FONT_VARS[theme.fontPair];
  return {
    "--site-primary": theme.primary,
    "--site-primary-fg": foregroundFor(theme.primary),
    "--site-accent": theme.accent,
    "--site-accent-fg": foregroundFor(theme.accent),
    "--site-bg": theme.background,
    "--site-fg": foregroundFor(theme.background),
    "--site-radius": RADIUS_VALUE[theme.radius],
    "--site-font-heading": fonts.heading,
    "--site-font-body": fonts.body,
  };
}
