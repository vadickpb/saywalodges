import { z } from "zod";

// Runtime validation for the /api/admin/* payloads. CLAUDE.md prohibits using
// `as` to "validate" external input — these schemas are the enforcement point.
//
// Note on scope: this only guards against malformed/oversized/wrong-shaped
// input at the API boundary. The actual XSS fix for editable content rendered
// into JSON-LD is escaping at the render site (app/[lang]/layout.tsx), since
// output encoding is what makes that sink safe regardless of what's stored.
// mapsUrl/airbnbUrl are restricted here because they're used directly as
// `href`/iframe `src` on the public site.

const MAX_SHORT = 200;
const MAX_LONG = 2000;

const shortText = z.string().max(MAX_SHORT);
const longText = z.string().max(MAX_LONG);
const nullableShortText = z.string().max(MAX_SHORT).nullable();

// Rejects anything that isn't an https:// URL, but allows "" (field unset).
// Deliberately avoids zod's built-in .url()/z.url() so behavior doesn't shift
// across zod versions; the WHATWG URL parser is the actual validation.
const httpsUrlOrEmpty = z.string().max(500).refine((value) => {
  if (value === "") return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}, "Must be an https:// URL or empty");

const roomCategory = z.enum(["pool", "rooms", "common", "outdoor"]);

const roomSchema = z.object({
  id: z.string().uuid().optional(),
  key: shortText,
  category: roomCategory,
  icon: z.string().max(20),
  capacity: z.string().max(20).nullable(),
  badgeEn: nullableShortText,
  badgeEs: nullableShortText,
  labelEn: shortText,
  labelEs: shortText,
  descEn: longText,
  descEs: longText,
  sortOrder: z.number().int().min(0),
});

const rateTierSchema = z.object({
  id: z.string().uuid().optional(),
  seasonEn: shortText,
  seasonEs: shortText,
  fromEn: shortText,
  fromEs: shortText,
  periodEn: shortText,
  periodEs: shortText,
  tagEn: shortText,
  tagEs: shortText,
  sortOrder: z.number().int().min(0),
});

const amenitySchema = z.object({
  id: z.string().uuid().optional(),
  icon: z.string().max(20),
  titleEn: shortText,
  titleEs: shortText,
  descEn: longText,
  descEs: longText,
  sortOrder: z.number().int().min(0),
});

const distanceSchema = z.object({
  id: z.string().uuid().optional(),
  placeEn: shortText,
  placeEs: shortText,
  timeEn: shortText,
  timeEs: shortText,
  icon: z.string().max(10),
  sortOrder: z.number().int().min(0),
});

export const contentPayloadSchema = z.object({
  property: z.object({
    name: shortText,
    whatsappNumber: z.string().max(20),
    whatsappMessageEn: longText,
    whatsappMessageEs: longText,
    email: z.string().max(MAX_SHORT).email().or(z.literal("")),
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
  }),
  rooms: z.array(roomSchema).max(100),
  rateTiers: z.array(rateTierSchema).max(50),
  amenities: z.array(amenitySchema).max(50),
  distances: z.array(distanceSchema).max(50),
});

export type ContentPayload = z.infer<typeof contentPayloadSchema>;

export const photosOrderPayloadSchema = z.object({
  heroId: z.string().uuid().nullable(),
  order: z.array(z.string().uuid()).max(500),
});

export const photoDeletePayloadSchema = z.object({
  id: z.string().uuid(),
});

// ─── Uploads ──────────────────────────────────────────────────────────────

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return "Unsupported file type. Use JPEG, PNG or WebP.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "File too large (max 5 MB).";
  }
  return null;
}
