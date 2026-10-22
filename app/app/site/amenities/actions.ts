"use server";

import { revalidatePath } from "next/cache";
import { createAmenity, deleteAmenity, listAmenities, reorderItems, updateAmenity } from "@/lib/dal/content";
import { moveId, amenityInputSchema, uuidSchema } from "@/lib/domain/content-manager";
import { GENERIC_ERROR, NO_CONTEXT_ERROR, getSiteContext, type ActionResult } from "../_lib/context";
import { readText, type FormState } from "../_lib/form-state";

const FIELDS = ["icon", "titleEn", "titleEs", "descEn", "descEs"] as const;
const PATH = "/app/site/amenities";

export async function saveAmenity(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = readText(formData, FIELDS);
  const idRaw = formData.get("id");
  const id = typeof idRaw === "string" && idRaw !== "" ? idRaw : null;

  const ctx = await getSiteContext();
  if (!ctx) return { ok: false, formError: NO_CONTEXT_ERROR, values };
  if (id && !uuidSchema.safeParse(id).success) return { ok: false, formError: GENERIC_ERROR, values };

  const parsed = amenityInputSchema.safeParse(values);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors, values };

  const result = id
    ? await updateAmenity(ctx.supabase, ctx.orgId, id, parsed.data)
    : await createAmenity(ctx.supabase, ctx.orgId, ctx.propertyId, parsed.data);
  if (!result.ok) return { ok: false, formError: GENERIC_ERROR, values };
  revalidatePath(PATH);
  // A new item clears the form (savedAt changes); an edit keeps what was typed.
  return { ok: true, values: id ? values : undefined, savedAt: Date.now() };
}

export async function deleteAmenityAction(formData: FormData): Promise<ActionResult> {
  const id = formData.get("id");
  const ctx = await getSiteContext();
  if (!ctx) return { ok: false, error: NO_CONTEXT_ERROR };
  if (typeof id !== "string" || !uuidSchema.safeParse(id).success) return { ok: false, error: GENERIC_ERROR };
  const result = await deleteAmenity(ctx.supabase, ctx.orgId, id);
  if (!result.ok) return { ok: false, error: GENERIC_ERROR };
  revalidatePath(PATH);
  return { ok: true };
}

export async function moveAmenityAction(formData: FormData): Promise<ActionResult> {
  const id = formData.get("id");
  const direction = formData.get("direction");
  const ctx = await getSiteContext();
  if (!ctx) return { ok: false, error: NO_CONTEXT_ERROR };
  if (typeof id !== "string" || !uuidSchema.safeParse(id).success || (direction !== "up" && direction !== "down")) {
    return { ok: false, error: GENERIC_ERROR };
  }
  const current = (await listAmenities(ctx.supabase, ctx.orgId)).map((i) => i.id);
  const next = moveId(current, id, direction);
  if (!next) return { ok: true };
  const result = await reorderItems(ctx.supabase, "amenities", ctx.propertyId, next);
  if (!result.ok) return { ok: false, error: GENERIC_ERROR };
  revalidatePath(PATH);
  return { ok: true };
}
