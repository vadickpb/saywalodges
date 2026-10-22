import { z } from "zod";

// Per-tenant copy for the public site template (SD-209), stored as
// properties.content (jsonb). Everything a visitor reads that's specific to
// one lodge lives here; dictionaries/ only hold generic UI labels.

const MAX_SHORT = 160;
const MAX_LONG = 1200;

const localized = (max: number) => z.object({ en: z.string().max(max), es: z.string().max(max) });

export const contentSchema = z.object({
  region: localized(MAX_SHORT).optional(),
  headline: localized(MAX_SHORT).optional(),
  tagline: localized(MAX_SHORT).optional(),
  intro: localized(MAX_LONG).optional(),
  highlights: z.array(localized(MAX_SHORT)).max(6).optional(),
  capacity: z.number().int().min(1).max(200).optional(),
  spacesIntro: localized(MAX_LONG).optional(),
  locationBlurb: localized(MAX_LONG).optional(),
  faq: z
    .array(z.object({ question: localized(MAX_SHORT), answer: localized(MAX_LONG) }))
    .max(12)
    .optional(),
});

export type SiteContent = z.infer<typeof contentSchema>;
export type Localized = { en: string; es: string };

// Never throws: invalid content renders as "no custom copy" (the template
// falls back to the property's name/meta fields) rather than a broken page.
export function resolveContent(raw: unknown): SiteContent {
  const parsed = contentSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

export function pick(value: Localized | undefined, lang: string): string {
  if (!value) return "";
  return lang === "es" ? value.es : value.en;
}
