"use server";

import { revalidatePath } from "next/cache";
import { listPhotos, deletePhoto, removeLogo, reorderPhotos, setHeroPhoto, setLogo, uploadPhoto } from "@/lib/dal/photos";
import {
  MAX_PHOTOS_PER_SCOPE,
  MAX_UPLOAD_BYTES,
  checkImageUpload,
  moveId,
  uuidSchema,
} from "@/lib/domain/content-manager";
import { GENERIC_ERROR, NO_CONTEXT_ERROR, getSiteContext, type ActionResult } from "../_lib/context";

const PATH = "/app/site/photos";

// Reads the uploaded File without trusting its declared type or size: the
// bytes are checked (magic bytes, 4 MB) by checkImageUpload.
async function readUpload(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false as const, error: "Selecciona una imagen." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false as const, error: "La imagen supera los 4 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkImageUpload(bytes);
  if (!check.ok) return { ok: false as const, error: check.error };
  return { ok: true as const, bytes, kind: check.kind };
}

// scope: "site" or a space uuid.
export async function uploadPhotoAction(formData: FormData): Promise<ActionResult> {
  const ctx = await getSiteContext();
  if (!ctx) return { ok: false, error: NO_CONTEXT_ERROR };
  const scopeRaw = formData.get("scope");
  const spaceId = typeof scopeRaw === "string" && scopeRaw !== "site" ? scopeRaw : null;
  if (spaceId !== null && !uuidSchema.safeParse(spaceId).success) return { ok: false, error: GENERIC_ERROR };

  const upload = await readUpload(formData);
  if (!upload.ok) return upload;

  const existing = (await listPhotos(ctx.supabase, ctx.orgId)).filter((p) => p.spaceId === spaceId);
  if (existing.length >= MAX_PHOTOS_PER_SCOPE) return { ok: false, error: "Alcanzaste el máximo de fotos." };

  const result = await uploadPhoto(ctx.supabase, {
    orgId: ctx.orgId,
    propertyId: ctx.propertyId,
    scope: spaceId ? { kind: "space", spaceId } : { kind: "site" },
    bytes: upload.bytes,
    kind: upload.kind,
  });
  if (!result.ok) return { ok: false, error: GENERIC_ERROR };
  revalidatePath(PATH);
  return { ok: true };
}

export async function deletePhotoAction(formData: FormData): Promise<ActionResult> {
  const id = formData.get("id");
  const ctx = await getSiteContext();
  if (!ctx) return { ok: false, error: NO_CONTEXT_ERROR };
  if (typeof id !== "string" || !uuidSchema.safeParse(id).success) return { ok: false, error: GENERIC_ERROR };
  const result = await deletePhoto(ctx.supabase, ctx.orgId, id);
  if (!result.ok) return { ok: false, error: GENERIC_ERROR };
  revalidatePath(PATH);
  return { ok: true };
}

export async function setHeroAction(formData: FormData): Promise<ActionResult> {
  const id = formData.get("id");
  const ctx = await getSiteContext();
  if (!ctx) return { ok: false, error: NO_CONTEXT_ERROR };
  if (typeof id !== "string" || !uuidSchema.safeParse(id).success) return { ok: false, error: GENERIC_ERROR };
  const result = await setHeroPhoto(ctx.supabase, ctx.propertyId, id);
  if (!result.ok) return { ok: false, error: GENERIC_ERROR };
  revalidatePath(PATH);
  return { ok: true };
}

export async function movePhotoAction(formData: FormData): Promise<ActionResult> {
  const id = formData.get("id");
  const direction = formData.get("direction");
  const ctx = await getSiteContext();
  if (!ctx) return { ok: false, error: NO_CONTEXT_ERROR };
  if (typeof id !== "string" || !uuidSchema.safeParse(id).success || (direction !== "up" && direction !== "down")) {
    return { ok: false, error: GENERIC_ERROR };
  }
  const all = await listPhotos(ctx.supabase, ctx.orgId);
  const photo = all.find((p) => p.id === id);
  if (!photo) return { ok: false, error: GENERIC_ERROR };
  const scoped = all.filter((p) => p.spaceId === photo.spaceId).map((p) => p.id);
  const next = moveId(scoped, id, direction);
  if (!next) return { ok: true };
  const result = await reorderPhotos(ctx.supabase, ctx.propertyId, photo.spaceId, next);
  if (!result.ok) return { ok: false, error: GENERIC_ERROR };
  revalidatePath(PATH);
  return { ok: true };
}

export async function uploadLogoAction(formData: FormData): Promise<ActionResult> {
  const ctx = await getSiteContext();
  if (!ctx) return { ok: false, error: NO_CONTEXT_ERROR };
  const upload = await readUpload(formData);
  if (!upload.ok) return upload;
  const result = await setLogo(ctx.supabase, { orgId: ctx.orgId, bytes: upload.bytes, kind: upload.kind });
  if (!result.ok) return { ok: false, error: GENERIC_ERROR };
  revalidatePath(PATH);
  return { ok: true };
}

export async function removeLogoAction(): Promise<ActionResult> {
  const ctx = await getSiteContext();
  if (!ctx) return { ok: false, error: NO_CONTEXT_ERROR };
  const result = await removeLogo(ctx.supabase, ctx.orgId);
  if (!result.ok) return { ok: false, error: GENERIC_ERROR };
  revalidatePath(PATH);
  return { ok: true };
}
