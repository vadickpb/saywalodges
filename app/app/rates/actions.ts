"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deletePricingRow, savePricingRow, simulateSavedPricing } from "@/lib/dal/rates";
import { seasonInputSchema, rateInputSchema, feeInputSchema, simulationSchema, pricingSectionSchema, pricingErrorMessage } from "@/lib/domain/rates-management";
import type { StayQuote } from "@/lib/domain/pricing";
import { readText, type FormState } from "../site/_lib/form-state";

export async function savePricingAction(section: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = readText(formData, ["name", "startDate", "endDate", "priority", "unitId", "seasonId", "nightlyAmount", "weekendAmount", "extraAmount", "minNights", "kind", "amount"]);
  const rawId = formData.get("id");
  const parsedId = z.union([z.uuid(), z.literal(""), z.null()]).safeParse(rawId);
  const parsedSection = pricingSectionSchema.safeParse(section);
  if (!parsedId.success || !parsedSection.success) return { ok: false, formError: "Datos inválidos.", values };
  const id = parsedId.data || null;
  const result = await (async () => {
    if (parsedSection.data === "seasons") {
      const parsed = seasonInputSchema.safeParse(values);
      if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors, values };
      return savePricingRow(id, { section: "seasons", input: parsed.data });
    }
    if (parsedSection.data === "rates") {
      const parsed = rateInputSchema.safeParse(values);
      if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors, values };
      return savePricingRow(id, { section: "rates", input: parsed.data });
    }
    const parsed = feeInputSchema.safeParse(values);
    if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors, values };
    return savePricingRow(id, { section: "fees", input: parsed.data });
  })();
  if (!result.ok) {
    if ("errors" in result) return result;
    return { ok: false, formError: result.error, values };
  }
  revalidatePath("/app/rates", "layout");
  if (!id) redirect(parsedSection.data === "rates" ? "/app/rates" : `/app/rates/${parsedSection.data}`);
  return { ok: true, values, savedAt: Date.now() };
}

export async function deletePricingAction(formData: FormData) {
  const parsed = z.object({ id: z.uuid(), section: pricingSectionSchema }).safeParse({ id: formData.get("id"), section: formData.get("section") });
  if (!parsed.success) return { ok: false as const, error: "Datos inválidos." };
  const result = await deletePricingRow(parsed.data.section, parsed.data.id);
  if (result.ok) revalidatePath("/app/rates", "layout");
  return result;
}

export type SimulationState = { values?: Record<string, string>; quote?: StayQuote; error?: string };
export async function simulatePricingAction(_prev: SimulationState, formData: FormData): Promise<SimulationState> {
  const values = readText(formData, ["unitId", "checkIn", "checkOut", "guests", "depositPercent"]);
  const parsed = simulationSchema.safeParse(values);
  if (!parsed.success) return { values, error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const result = await simulateSavedPricing(parsed.data);
  if (!result) return { values, error: "No se encontró la unidad en tu propiedad activa." };
  return result.ok ? { values, quote: result.quote } : { values, error: pricingErrorMessage(result.error) };
}
