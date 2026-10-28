"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { confirmRecurring, createTemplate, deleteTemplate, setTemplateActive, updateTemplate } from "@/lib/dal/finance-recurring";
import { confirmFormSchema, templateFormSchema } from "@/lib/domain/finance-recurring";
import { currentMonth } from "@/lib/domain/finance-view";
import { readText, type FormState } from "../../site/_lib/form-state";
import { GENERIC_ERROR, NO_CONTEXT_ERROR, getFinanceContext } from "../_lib/context";

// Recurring expenses are owner-only end to end: every action re-checks the role
// on the server (the UI hiding a button is not authorization) and RLS is the
// second barrier. The org always comes from the session.

const TEMPLATE_FIELDS = ["name", "categoryId", "unitId", "dayOfMonth", "amount", "currency", "counterparty", "paymentMethod"] as const;
const CONFIRM_FIELDS = ["recurringId", "month", "amount", "currency", "fxRate", "occurredOn"] as const;
const NOT_OWNER_ERROR = "Solo el dueño puede gestionar gastos recurrentes.";

async function ownerContext() {
  const ctx = await getFinanceContext();
  if (!ctx) return { ok: false, error: NO_CONTEXT_ERROR } as const;
  if (!ctx.isOwner) return { ok: false, error: NOT_OWNER_ERROR } as const;
  return { ok: true, ctx } as const;
}

const fail = (values: Record<string, string>, formError: string): FormState => ({ ok: false, formError, values });

export async function createTemplateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = readText(formData, TEMPLATE_FIELDS);
  const owner = await ownerContext();
  if (!owner.ok) return fail(values, owner.error);
  const parsed = templateFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors, values };
  const result = await createTemplate(owner.ctx.supabase, owner.ctx.orgId, parsed.data);
  if (!result.ok) return fail(values, GENERIC_ERROR);
  revalidatePath("/app/finance", "layout");
  redirect("/app/finance/recurring");
}

export async function updateTemplateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = readText(formData, TEMPLATE_FIELDS);
  const id = z.string().uuid().safeParse(formData.get("id"));
  const owner = await ownerContext();
  if (!owner.ok) return fail(values, owner.error);
  if (!id.success) return fail(values, GENERIC_ERROR);
  const parsed = templateFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors, values };
  const result = await updateTemplate(owner.ctx.supabase, owner.ctx.orgId, id.data, parsed.data);
  if (!result.ok) return fail(values, GENERIC_ERROR);
  revalidatePath("/app/finance", "layout");
  redirect("/app/finance/recurring");
}

type RowResult = { ok: true } | { ok: false; error: string };

export async function toggleTemplateAction(formData: FormData): Promise<RowResult> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  const active = formData.get("active");
  const owner = await ownerContext();
  if (!owner.ok) return { ok: false, error: owner.error };
  if (!id.success || (active !== "true" && active !== "false")) return { ok: false, error: GENERIC_ERROR };
  const result = await setTemplateActive(owner.ctx.supabase, owner.ctx.orgId, id.data, active === "true");
  if (!result.ok) return { ok: false, error: GENERIC_ERROR };
  revalidatePath("/app/finance", "layout");
  return { ok: true };
}

export async function deleteTemplateAction(formData: FormData): Promise<RowResult> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  const owner = await ownerContext();
  if (!owner.ok) return { ok: false, error: owner.error };
  if (!id.success) return { ok: false, error: GENERIC_ERROR };
  const result = await deleteTemplate(owner.ctx.supabase, owner.ctx.orgId, id.data);
  if (!result.ok) return { ok: false, error: GENERIC_ERROR };
  revalidatePath("/app/finance", "layout");
  return { ok: true };
}

// Confirms one pending month with the real amount. The database makes it
// idempotent: a second click (or a second tab) gets the first expense back.
export async function confirmRecurringAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = readText(formData, CONFIRM_FIELDS);
  const owner = await ownerContext();
  if (!owner.ok) return fail(values, owner.error);
  const parsed = confirmFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors, values };
  if (parsed.data.month.slice(0, 7) > currentMonth(new Date())) return fail(values, "Ese mes todavía no empieza.");
  const result = await confirmRecurring(owner.ctx.supabase, owner.ctx.orgId, parsed.data);
  if (!result.ok) return fail(values, GENERIC_ERROR);
  revalidatePath("/app/finance", "layout");
  return { ok: true, savedAt: Date.now() };
}
