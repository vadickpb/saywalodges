import { z } from "zod";
import {
  PRESETS,
  contrastWarnings,
  resolveTheme,
  themeSchema,
  type ResolvedTheme,
} from "@/lib/domain/site-theme";
import { contentSchema, type SiteContent } from "@/lib/domain/site-content";

// "Sitio → Apariencia" editor (SD-210). The form is a client component that
// holds the whole draft and sends it as one JSON `payload` field; this module
// is the single place that turns that untrusted string into the exact
// { theme, content } pair written to properties. It reuses themeSchema and
// contentSchema, so the editor can never store something the public site
// would reject.

// Generous upper bound for the serialized draft (12 FAQ × 2 langs × 1.4 KB
// plus the rest is well under this); stops absurd bodies before JSON.parse.
export const MAX_PAYLOAD_CHARS = 100_000;

// Persists only what differs from the chosen preset, so a tenant that just
// picks "costa" stores { preset: "costa" } and keeps following that preset.
export function themeToStored(theme: ResolvedTheme): Record<string, string> {
  const base = PRESETS[theme.preset];
  const stored: Record<string, string> = { preset: theme.preset };
  if (theme.primary !== base.primary.toUpperCase()) stored.primary = theme.primary;
  if (theme.accent !== base.accent.toUpperCase()) stored.accent = theme.accent;
  if (theme.background !== base.background.toUpperCase()) stored.background = theme.background;
  if (theme.fontPair !== base.fontPair) stored.fontPair = theme.fontPair;
  if (theme.radius !== base.radius) stored.radius = theme.radius;
  return stored;
}

const blank = (value: string) => value.trim() === "";

type Pair = { en: string; es: string };

const trimPair = (pair: Pair): Pair => ({ en: pair.en.trim(), es: pair.es.trim() });

// A localized field with both languages empty means "no custom copy": it is
// dropped so the template falls back to the property's own fields.
function keepPair(pair: Pair | undefined): Pair | undefined {
  if (!pair) return undefined;
  const trimmed = trimPair(pair);
  return blank(trimmed.en) && blank(trimmed.es) ? undefined : trimmed;
}

const bothLanguages = (pair: Pair) => !blank(pair.en) && !blank(pair.es);

// Trims, drops empty optional fields and empty list rows. Rows that are only
// half-filled are kept so the schema check below can reject them.
export function normalizeContent(content: SiteContent): SiteContent {
  const out: SiteContent = {};
  for (const key of ["region", "headline", "tagline", "intro", "spacesIntro", "locationBlurb"] as const) {
    const pair = keepPair(content[key]);
    if (pair) out[key] = pair;
  }
  if (content.capacity !== undefined) out.capacity = content.capacity;
  const highlights = (content.highlights ?? []).flatMap((h) => keepPair(h) ?? []);
  if (highlights.length > 0) out.highlights = highlights;
  const faq = (content.faq ?? []).flatMap((item) => {
    const question = keepPair(item.question);
    const answer = keepPair(item.answer);
    return question || answer
      ? [{ question: question ?? { en: "", es: "" }, answer: answer ?? { en: "", es: "" } }]
      : [];
  });
  if (faq.length > 0) out.faq = faq;
  return out;
}

// Stricter than contentSchema on purpose: a FAQ row or highlight must be
// complete in BOTH languages, otherwise one of the two public sites would
// render an empty question or bullet.
const completeContent = contentSchema.superRefine((content, ctx) => {
  content.highlights?.forEach((h, i) => {
    if (!bothLanguages(h)) ctx.addIssue({ code: "custom", path: ["highlights", i], message: "incomplete" });
  });
  content.faq?.forEach((item, i) => {
    for (const field of ["question", "answer"] as const) {
      if (!bothLanguages(item[field])) ctx.addIssue({ code: "custom", path: ["faq", i, field], message: "incomplete" });
    }
  });
});

export const appearancePayloadSchema = z.object({
  theme: themeSchema,
  content: completeContent,
});

export type AppearanceInput = { theme: Record<string, string>; content: SiteContent };

export type AppearanceParseResult =
  | { ok: true; data: AppearanceInput; warnings: ReturnType<typeof contrastWarnings> }
  | { ok: false; paths: string[] };

// `raw` is the untrusted `payload` form field.
export function parseAppearancePayload(raw: unknown): AppearanceParseResult {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_PAYLOAD_CHARS) {
    return { ok: false, paths: ["payload"] };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, paths: ["payload"] };
  }
  const shape = z.object({ theme: z.unknown(), content: z.unknown() }).safeParse(json);
  if (!shape.success) return { ok: false, paths: ["payload"] };
  const contentObject = contentSchema.safeParse(shape.data.content);
  const normalized = contentObject.success ? normalizeContent(contentObject.data) : shape.data.content;
  const parsed = appearancePayloadSchema.safeParse({ theme: shape.data.theme, content: normalized });
  if (!parsed.success) {
    return { ok: false, paths: [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))] };
  }
  const resolved = resolveTheme(parsed.data.theme);
  return { ok: true, data: { theme: themeToStored(resolved), content: parsed.data.content }, warnings: contrastWarnings(resolved) };
}
