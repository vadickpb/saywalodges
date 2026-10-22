import { z } from "zod";

// Pure rules for the dashboard's content manager (spaces, amenities,
// distances, photos). No I/O: lib/dal/content.ts and lib/dal/photos.ts apply
// them, app/app/site/*/actions.ts calls both. Limits mirror the legacy
// lib/validation/admin.ts, which SD-203 deletes.

const MAX_SHORT = 200;
const MAX_LONG = 2000;
const shortText = z.string().trim().max(MAX_SHORT, "Máximo 200 caracteres");
const longText = z.string().trim().max(MAX_LONG, "Máximo 2000 caracteres");
const required = shortText.min(1, "Obligatorio");

export const SPACE_CATEGORIES = ["pool", "rooms", "common", "outdoor"] as const;
export type SpaceCategory = (typeof SPACE_CATEGORIES)[number];

export const SPACE_CATEGORY_LABELS: Record<SpaceCategory, string> = {
  pool: "Piscina",
  rooms: "Habitaciones",
  common: "Áreas comunes",
  outdoor: "Exteriores",
};

// A blank optional text field is stored as null (badge/capacity are nullable).
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .transform((v) => (v === "" ? null : v));

export const spaceInputSchema = z.object({
  key: required.regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones"),
  category: z.enum(SPACE_CATEGORIES),
  icon: z.string().trim().max(20),
  capacity: nullableText(20),
  badgeEn: nullableText(MAX_SHORT),
  badgeEs: nullableText(MAX_SHORT),
  labelEn: required,
  labelEs: required,
  descEn: longText,
  descEs: longText,
});
export type SpaceInput = z.infer<typeof spaceInputSchema>;

export const amenityInputSchema = z.object({
  icon: z.string().trim().max(20),
  titleEn: required,
  titleEs: required,
  descEn: longText,
  descEs: longText,
});
export type AmenityInput = z.infer<typeof amenityInputSchema>;

export const distanceInputSchema = z.object({
  placeEn: required,
  placeEs: required,
  timeEn: shortText,
  timeEs: shortText,
  icon: z.string().trim().max(10),
});
export type DistanceInput = z.infer<typeof distanceInputSchema>;

export const MAX_SPACES = 100;
export const MAX_AMENITIES = 50;
export const MAX_DISTANCES = 50;
export const MAX_PHOTOS_PER_SCOPE = 100;

export const uuidSchema = z.string().uuid();

// ─── Order helpers ──────────────────────────────────────────────────────────

// New id order after moving `id` one step; null when it can't move (already at
// the edge, or not in the list) so the action can skip the write.
export function moveId(ids: readonly string[], id: string, direction: "up" | "down"): string[] | null {
  const from = ids.indexOf(id);
  if (from === -1) return null;
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

// ─── Image uploads ──────────────────────────────────────────────────────────

// 4 MB, below the bucket's 5 MB and Vercel's 4.5 MB request-body cap, so a
// valid upload is never rejected by the platform before our own check.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export type ImageKind = { mime: "image/jpeg" | "image/png" | "image/webp"; ext: "jpg" | "png" | "webp" };

// The declared Content-Type is client-controlled (and is all the bucket's
// allowed_mime_types can check), so the real type comes from the magic bytes.
export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return { mime: "image/png", ext: "png" };
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

export type UploadCheck = { ok: true; kind: ImageKind } | { ok: false; error: string };

export function checkImageUpload(bytes: Uint8Array): UploadCheck {
  if (bytes.length === 0) return { ok: false, error: "El archivo está vacío." };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, error: "La imagen supera los 4 MB." };
  const kind = detectImageKind(bytes);
  if (!kind) return { ok: false, error: "Formato no admitido. Usa JPEG, PNG o WebP." };
  return { ok: true, kind };
}

export type PhotoScope =
  | { kind: "site" }
  | { kind: "space"; spaceId: string }
  | { kind: "branding" };

// {org_id}/site/<id>.ext · {org_id}/spaces/<space_id>/<id>.ext ·
// {org_id}/branding/<id>.ext — the first segment is what the storage.objects
// policies authorise on. `fileId` must be a fresh uuid (never user input), so
// the name can't traverse or collide.
export function buildPhotoPath(orgId: string, scope: PhotoScope, fileId: string, ext: ImageKind["ext"]): string {
  if (!uuidSchema.safeParse(orgId).success || !uuidSchema.safeParse(fileId).success) {
    throw new Error("buildPhotoPath: orgId and fileId must be uuids");
  }
  switch (scope.kind) {
    case "site":
      return `${orgId}/site/${fileId}.${ext}`;
    case "branding":
      return `${orgId}/branding/${fileId}.${ext}`;
    case "space":
      if (!uuidSchema.safeParse(scope.spaceId).success) throw new Error("buildPhotoPath: spaceId must be a uuid");
      return `${orgId}/spaces/${scope.spaceId}/${fileId}.${ext}`;
  }
}
