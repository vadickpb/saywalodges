"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createUnit, deleteUnit, setUnitActive, updateUnit } from "@/lib/dal/units";
import { unitInputSchema } from "@/lib/domain/units";
import { GENERIC_ERROR, NO_CONTEXT_ERROR, getSiteContext, type ActionResult } from "../_lib/context";
import { readText, type FormState } from "../_lib/form-state";

const PATH = "/app/site/units";
const idSchema = z.uuid();

export async function saveUnit(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = readText(formData, ["name", "kind", "maxGuests", "includedGuests", "active"]);
  const ctx = await getSiteContext();
  if (!ctx) return { ok: false, formError: NO_CONTEXT_ERROR, values };
  const idRaw = formData.get("id");
  const id = idRaw === null || idRaw === "" ? null : idSchema.safeParse(idRaw);
  if (id && !id.success) return { ok: false, formError: GENERIC_ERROR, values };
  const parsed = unitInputSchema.safeParse(values);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors, values };
  const result = id?.success
    ? await updateUnit(ctx.supabase, ctx.orgId, id.data, parsed.data)
    : await createUnit(ctx.supabase, ctx.orgId, ctx.propertyId, parsed.data);
  if (!result.ok) return { ok: false, formError: GENERIC_ERROR, values };
  revalidatePath(PATH, "layout");
  if (!id) redirect(PATH);
  return { ok: true, values, savedAt: Date.now() };
}

export async function setUnitActiveAction(formData: FormData): Promise<ActionResult> {
  const ctx = await getSiteContext();
  if (!ctx) return { ok: false, error: NO_CONTEXT_ERROR };
  const parsed = z.object({ id: idSchema, active: z.enum(["true", "false"]) }).safeParse({ id: formData.get("id"), active: formData.get("active") });
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
  const result = await setUnitActive(ctx.supabase, ctx.orgId, parsed.data.id, parsed.data.active === "true");
  if (!result.ok) return { ok: false, error: GENERIC_ERROR };
  revalidatePath(PATH, "layout");
  return { ok: true };
}

export async function deleteUnitAction(formData: FormData): Promise<ActionResult> {
  const ctx = await getSiteContext();
  if (!ctx) return { ok: false, error: NO_CONTEXT_ERROR };
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: GENERIC_ERROR };
  const result = await deleteUnit(ctx.supabase, ctx.orgId, id.data);
  if (!result.ok) return { ok: false, error: GENERIC_ERROR };
  revalidatePath(PATH, "layout");
  return { ok: true };
}
