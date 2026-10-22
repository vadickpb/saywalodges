"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSpace, deleteSpaceRow, listSpaces, reorderItems, updateSpace } from "@/lib/dal/content";
import { deleteSpaceWithPhotos } from "@/lib/dal/photos";
import { moveId, spaceInputSchema, uuidSchema } from "@/lib/domain/content-manager";
import { GENERIC_ERROR, NO_CONTEXT_ERROR, getSiteContext, type ActionResult } from "../_lib/context";
import { readText, type FormState } from "../_lib/form-state";

const FIELDS = [
  "key", "category", "icon", "capacity", "badgeEn", "badgeEs", "labelEn", "labelEs", "descEn", "descEs",
] as const;

export async function saveSpace(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = readText(formData, FIELDS);
  const idRaw = formData.get("id");
  const id = typeof idRaw === "string" && idRaw !== "" ? idRaw : null;

  const ctx = await getSiteContext();
  if (!ctx) return { ok: false, formError: NO_CONTEXT_ERROR, values };
  if (id && !uuidSchema.safeParse(id).success) return { ok: false, formError: GENERIC_ERROR, values };

  const parsed = spaceInputSchema.safeParse(values);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors, values };

  const result = id
    ? await updateSpace(ctx.supabase, ctx.orgId, id, parsed.data)
    : await createSpace(ctx.supabase, ctx.orgId, ctx.propertyId, parsed.data);
  if (!result.ok) {
    if (result.duplicateKey) return { ok: false, errors: { key: ["Ya existe un espacio con esa clave"] }, values };
    return { ok: false, formError: GENERIC_ERROR, values };
  }
  revalidatePath("/app/site/spaces");
  if (!id) redirect("/app/site/spaces");
  return { ok: true, values, savedAt: Date.now() };
}

export async function deleteSpaceAction(formData: FormData): Promise<ActionResult> {
  const id = formData.get("id");
  const ctx = await getSiteContext();
  if (!ctx) return { ok: false, error: NO_CONTEXT_ERROR };
  if (typeof id !== "string" || !uuidSchema.safeParse(id).success) return { ok: false, error: GENERIC_ERROR };
  const result = await deleteSpaceWithPhotos(ctx.supabase, ctx.orgId, id, deleteSpaceRow);
  if (!result.ok) return { ok: false, error: GENERIC_ERROR };
  revalidatePath("/app/site/spaces");
  revalidatePath("/app/site/photos");
  return { ok: true };
}

export async function moveSpaceAction(formData: FormData): Promise<ActionResult> {
  const id = formData.get("id");
  const direction = formData.get("direction");
  const ctx = await getSiteContext();
  if (!ctx) return { ok: false, error: NO_CONTEXT_ERROR };
  if (typeof id !== "string" || !uuidSchema.safeParse(id).success || (direction !== "up" && direction !== "down")) {
    return { ok: false, error: GENERIC_ERROR };
  }
  const current = (await listSpaces(ctx.supabase, ctx.orgId)).map((s) => s.id);
  const next = moveId(current, id, direction);
  if (!next) return { ok: true }; // already at the edge
  const result = await reorderItems(ctx.supabase, "spaces", ctx.propertyId, next);
  if (!result.ok) return { ok: false, error: GENERIC_ERROR };
  revalidatePath("/app/site/spaces");
  return { ok: true };
}
