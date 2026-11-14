"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createManualBlock, deleteManualBlock, getCalendarContext, CALENDAR_ERROR } from "@/lib/dal/calendar";
import { manualBlockSchema } from "@/lib/domain/calendar";
import { clearPriceRangeSchema, priceRangeSchema } from "@/lib/domain/price-ranges";
import { clearPriceRange, setPriceRange } from "@/lib/dal/rates";
import { readText, type FormState } from "@/app/app/site/_lib/form-state";

export async function createManualBlockAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = readText(formData, ["unitId", "start", "end", "note"]);
  const ctx = await getCalendarContext();
  if (!ctx) return { ok: false, formError: "No tienes una propiedad activa.", values };
  const parsed = manualBlockSchema.safeParse(values);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors, values };
  const result = await createManualBlock(ctx, parsed.data);
  if (!result.ok) return { ok: false, formError: result.error, values };
  revalidatePath("/app/calendar");
  return { ok: true, savedAt: Date.now() };
}

export async function deleteManualBlockAction(formData: FormData) {
  const ctx = await getCalendarContext();
  if (!ctx) return { ok: false, error: "No tienes una propiedad activa." } as const;
  const parsed = z.uuid().safeParse(formData.get("id"));
  if (!parsed.success) return { ok: false, error: CALENDAR_ERROR } as const;
  const result = await deleteManualBlock(ctx, parsed.data);
  if (result.ok) revalidatePath("/app/calendar");
  return result;
}

// SD-421 part 3. Both actions only forward validated text; amounts become cents in the schema and the database re-validates.
export async function setPriceRangeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = readText(formData, ["unitId", "start", "end", "price", "minNights"]);
  const parsed = priceRangeSchema.safeParse(values);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors, values };
  const result = await setPriceRange(parsed.data);
  if (!result.ok) return { ok: false, formError: result.error, values };
  revalidatePath("/app/calendar");
  revalidatePath("/app/rates");
  return { ok: true, savedAt: Date.now() };
}

export async function clearPriceRangeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = readText(formData, ["unitId", "start", "end"]);
  const parsed = clearPriceRangeSchema.safeParse(values);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors, values };
  const result = await clearPriceRange(parsed.data);
  if (!result.ok) return { ok: false, formError: result.error, values };
  revalidatePath("/app/calendar");
  revalidatePath("/app/rates");
  return { ok: true, savedAt: Date.now() };
}
