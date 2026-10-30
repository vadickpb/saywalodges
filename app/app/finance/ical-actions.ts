"use server";

import { revalidatePath } from "next/cache";
import { completeRental } from "@/lib/dal/finance-ical";
import { completeRentalFormSchema } from "@/lib/domain/finance-ical";
import { readText, type FormState } from "../site/_lib/form-state";
import { GENERIC_ERROR, NO_CONTEXT_ERROR, getFinanceContext } from "./_lib/context";

// Owner-only, like the recurring expenses: the role is re-checked here (hiding the form
// is not authorization), the database checks it again, and the org comes from the session.

const FIELDS = ["blockId", "amount", "currency", "fxRate", "occurredOn", "guests", "cleaning"] as const;
const NOT_OWNER_ERROR = "Solo el dueño puede completar alquileres importados.";

const fail = (values: Record<string, string>, formError: string): FormState => ({ ok: false, formError, values });

export async function completeRentalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = readText(formData, FIELDS);
  const ctx = await getFinanceContext();
  if (!ctx) return fail(values, NO_CONTEXT_ERROR);
  if (!ctx.isOwner) return fail(values, NOT_OWNER_ERROR);
  const parsed = completeRentalFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors, values };
  const result = await completeRental(ctx.supabase, ctx.orgId, parsed.data);
  if (!result.ok) return fail(values, GENERIC_ERROR);
  revalidatePath("/app/finance", "layout");
  return { ok: true, savedAt: Date.now() };
}
