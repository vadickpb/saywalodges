"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createEntry, createRental, deleteEntry, removeReceipt, updateEntry, uploadReceipt } from "@/lib/dal/finance";
import {
  MAX_RECEIPT_BYTES,
  buildReceiptPath,
  checkReceipt,
  entryFormSchema,
  rentalFormSchema,
  type ReceiptKind,
} from "@/lib/domain/finance-forms";
import { readText, type FormState } from "../site/_lib/form-state";
import { GENERIC_ERROR, NO_CONTEXT_ERROR, getFinanceContext } from "./_lib/context";

const ENTRY_FIELDS = [
  "kind", "occurredOn", "amount", "currency", "fxRate", "categoryId", "unitId", "paymentMethod", "counterparty", "note",
] as const;
const RENTAL_FIELDS = [
  "unitId", "stayStart", "stayEnd", "channel", "guests", "guestName", "occurredOn", "amount", "currency", "fxRate",
  "paymentMethod", "note", "commission", "cleaning",
] as const;

type Receipt = { bytes: Uint8Array; kind: ReceiptKind };
type ReceiptRead = { ok: true; receipt: Receipt | null } | { ok: false; error: string };

// The uploaded file is optional. Its type comes from the magic bytes and its
// size is re-checked here: the browser's file picker and the bucket's declared
// MIME list are only conveniences.
async function readReceipt(formData: FormData): Promise<ReceiptRead> {
  // Two inputs feed the same receipt: "Tomar foto" (camera, receiptPhoto) and
  // "Elegir archivo" (receipt, any allowed type). The chosen file wins.
  const chosen = formData.get("receipt");
  const photo = formData.get("receiptPhoto");
  const file = chosen instanceof File && chosen.size > 0 ? chosen : photo;
  if (!(file instanceof File) || file.size === 0) return { ok: true, receipt: null };
  if (file.size > MAX_RECEIPT_BYTES) return { ok: false, error: "El comprobante supera los 4 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkReceipt(bytes);
  return check.ok ? { ok: true, receipt: { bytes, kind: check.kind } } : { ok: false, error: check.error };
}

// Uploads the receipt (if any) before the row is written; the caller removes it
// again with `discard` when the write fails, so a failed save leaves no orphan.
async function stageReceipt(
  supabase: SupabaseClient<Database>,
  orgId: string,
  receipt: Receipt | null
): Promise<{ ok: true; path?: string } | { ok: false }> {
  if (!receipt) return { ok: true };
  const path = buildReceiptPath(orgId, crypto.randomUUID(), receipt.kind.ext);
  return (await uploadReceipt(supabase, path, receipt.bytes, receipt.kind.mime)) ? { ok: true, path } : { ok: false };
}

function fail(values: Record<string, string>, formError: string): FormState {
  return { ok: false, formError, values };
}

export async function createEntryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = readText(formData, ENTRY_FIELDS);
  const ctx = await getFinanceContext();
  if (!ctx) return fail(values, NO_CONTEXT_ERROR);

  const parsed = entryFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors, values };
  const read = await readReceipt(formData);
  if (!read.ok) return { ok: false, errors: { receipt: [read.error] }, values };

  const staged = await stageReceipt(ctx.supabase, ctx.orgId, read.receipt);
  if (!staged.ok) return fail(values, GENERIC_ERROR);
  const result = await createEntry(ctx.supabase, ctx.orgId, parsed.data, staged.path);
  if (!result.ok) {
    if (staged.path) await removeReceipt(ctx.supabase, staged.path);
    return fail(values, GENERIC_ERROR);
  }
  revalidatePath("/app/finance");
  redirect(`/app/finance?month=${parsed.data.occurredOn.slice(0, 7)}`);
}

export async function createRentalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = readText(formData, RENTAL_FIELDS);
  // The cleaning amount only applies when its checkbox is ticked.
  if (formData.get("addCleaning") !== "on") values.cleaning = "";
  const ctx = await getFinanceContext();
  if (!ctx) return fail(values, NO_CONTEXT_ERROR);

  const parsed = rentalFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors, values };
  const read = await readReceipt(formData);
  if (!read.ok) return { ok: false, errors: { receipt: [read.error] }, values };

  const staged = await stageReceipt(ctx.supabase, ctx.orgId, read.receipt);
  if (!staged.ok) return fail(values, GENERIC_ERROR);
  const result = await createRental(ctx.supabase, ctx.orgId, parsed.data, staged.path);
  if (!result.ok) {
    if (staged.path) await removeReceipt(ctx.supabase, staged.path);
    return fail(values, GENERIC_ERROR);
  }
  revalidatePath("/app/finance");
  redirect(`/app/finance?month=${parsed.data.occurredOn.slice(0, 7)}`);
}

export async function updateEntryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = readText(formData, ENTRY_FIELDS);
  const idParsed = z.string().uuid().safeParse(formData.get("id"));
  const ctx = await getFinanceContext();
  if (!ctx) return fail(values, NO_CONTEXT_ERROR);
  if (!idParsed.success) return fail(values, GENERIC_ERROR);

  const parsed = entryFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors, values };
  const read = await readReceipt(formData);
  if (!read.ok) return { ok: false, errors: { receipt: [read.error] }, values };

  const staged = await stageReceipt(ctx.supabase, ctx.orgId, read.receipt);
  if (!staged.ok) return fail(values, GENERIC_ERROR);
  const result = await updateEntry(ctx.supabase, ctx.orgId, idParsed.data, parsed.data, staged.path);
  if (!result.ok) {
    if (staged.path) await removeReceipt(ctx.supabase, staged.path);
    return fail(values, GENERIC_ERROR);
  }
  revalidatePath("/app/finance");
  redirect(`/app/finance?month=${parsed.data.occurredOn.slice(0, 7)}`);
}

export async function deleteEntryAction(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  const ctx = await getFinanceContext();
  if (!ctx) return { ok: false, error: NO_CONTEXT_ERROR };
  if (!id.success) return { ok: false, error: GENERIC_ERROR };
  const result = await deleteEntry(ctx.supabase, ctx.orgId, id.data);
  if (!result.ok) return { ok: false, error: GENERIC_ERROR };
  revalidatePath("/app/finance");
  return { ok: true };
}
