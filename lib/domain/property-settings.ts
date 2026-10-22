import { z } from "zod";

// Validation for the dashboard's "Sitio → Información" form (SD-201).
// Own schema, not a re-import from lib/validation/admin.ts — that file
// belongs to the legacy single-tenant admin API, removed in SD-203; the
// field limits below are the same ones already proven there, just owned by
// this ticket instead. logo_path and theme/content are deliberately not
// here: see docs/roadmap.md's SD-201 closing note for why.

const MAX_SHORT = 200;
const MAX_LONG = 2000;

const shortText = z.string().max(MAX_SHORT);
const longText = z.string().max(MAX_LONG);

// Rejects anything that isn't an https:// URL, but allows "" (field unset).
// Avoids zod's built-in url()/z.url() so behavior doesn't shift across zod
// versions; the WHATWG URL parser is the actual validation. Required
// because these values become href/iframe src on the public site
// (components/site/location.tsx) — a javascript: value there would be a
// stored XSS against that tenant's own visitors.
//
// The extra startsWith("https://") check (found by security-reviewer) isn't
// about security — the URL parser alone already rejects javascript:/data:
// and lowercases the scheme — it's so zod rejects the exact same inputs the
// DB's CHECK constraint does (properties_maps_url_format/
// properties_airbnb_url_format, both `~ '^https://'`, case-sensitive). The
// parser alone accepts "HTTPS://x" or " https://x" (trimmed/normalized),
// which would then fail at the DB as an opaque save error instead of an
// inline field error.
const httpsUrlOrEmpty = z.string().max(500).refine((value) => {
  if (value === "") return true;
  if (!value.startsWith("https://")) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}, "Debe ser una URL https:// o estar vacío");

export const propertySettingsSchema = z.object({
  name: shortText.min(1, "Obligatorio"),
  whatsappNumber: z.string().regex(/^\d{0,20}$/, "Solo números, sin + ni espacios"),
  whatsappMessageEn: longText,
  whatsappMessageEs: longText,
  email: z.string().max(MAX_SHORT).email("Email inválido").or(z.literal("")),
  mapsUrl: httpsUrlOrEmpty,
  airbnbUrl: httpsUrlOrEmpty,
  addressLocality: shortText,
  addressRegion: shortText,
  addressCountry: z.string().max(2),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  metaTitleEn: shortText,
  metaTitleEs: shortText,
  metaDescriptionEn: longText,
  metaDescriptionEs: longText,
  metaKeywordsEn: z.array(shortText).max(30),
  metaKeywordsEs: z.array(shortText).max(30),
  priceRange: z.string().max(10),
  starRating: z.number().min(0).max(5).nullable(),
  petsAllowed: z.boolean(),
});

export type PropertySettings = z.infer<typeof propertySettingsSchema>;
