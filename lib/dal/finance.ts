import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { EntryForm, RentalForm } from "@/lib/domain/finance-forms";
import { monthRange } from "@/lib/domain/finance-view";

// Member access to the finance ledger with the SESSION client only (never
// service-role): RLS decides what each role sees — the owner everything, staff
// only the rows they created. Same conventions as lib/dal/content.ts: orgId
// comes from requireActiveOrg(), writes verify the affected-row count (RLS
// filtering a write returns 0 rows with no error), and failures are logged and
// reported to the caller as a generic {ok:false}.

type Client = SupabaseClient<Database>;
type Row = Database["public"]["Tables"]["finance_entries"]["Row"];
export type Result<T = object> = ({ ok: true } & T) | { ok: false };

export const RECEIPTS_BUCKET = "finance-receipts";
export const LEDGER_LIMIT = 500;

export type FinanceCategory = {
  id: string;
  kind: Row["kind"];
  name: string;
  systemKey: string | null;
  archived: boolean;
};

export type LedgerEntry = {
  id: string;
  kind: Row["kind"];
  categoryId: string;
  occurredOn: string;
  amountCents: number;
  currency: Row["currency"];
  fxRatePen: number | null;
  amountPenCents: number;
  unitId: string | null;
  paymentMethod: Row["payment_method"];
  counterparty: string | null;
  note: string | null;
  stayStart: string | null;
  stayEnd: string | null;
  channel: Row["channel"];
  guests: number | null;
  relatedEntryId: string | null;
  hasReceipt: boolean;
  createdBy: string | null;
};

const COLUMNS =
  "id, kind, category_id, occurred_on, amount_cents, currency, fx_rate_pen, amount_pen_cents, unit_id, payment_method, counterparty, note, stay_start, stay_end, channel, guests, related_entry_id, receipt_path, created_by";

// amount_pen_cents is a generated column: the type generator marks it nullable,
// but the fx check makes it non-null for every valid row. A null would mean the
// ledger is corrupt, so fail loudly instead of reporting a made-up zero.
function penCents(r: { id: string; amount_pen_cents: number | null }): number {
  if (r.amount_pen_cents === null) throw new Error(`finance entry ${r.id} has no PEN amount`);
  return r.amount_pen_cents;
}

function toEntry(r: Pick<Row, "id" | "kind" | "category_id" | "occurred_on" | "amount_cents" | "currency" | "fx_rate_pen" | "amount_pen_cents" | "unit_id" | "payment_method" | "counterparty" | "note" | "stay_start" | "stay_end" | "channel" | "guests" | "related_entry_id" | "receipt_path" | "created_by">): LedgerEntry {
  return {
    id: r.id,
    kind: r.kind,
    categoryId: r.category_id,
    occurredOn: r.occurred_on,
    amountCents: r.amount_cents,
    currency: r.currency,
    fxRatePen: r.fx_rate_pen,
    amountPenCents: penCents(r),
    unitId: r.unit_id,
    paymentMethod: r.payment_method,
    counterparty: r.counterparty,
    note: r.note,
    stayStart: r.stay_start,
    stayEnd: r.stay_end,
    channel: r.channel,
    guests: r.guests,
    relatedEntryId: r.related_entry_id,
    hasReceipt: r.receipt_path !== null,
    createdBy: r.created_by,
  };
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function listCategories(supabase: Client, orgId: string): Promise<FinanceCategory[]> {
  const { data, error } = await supabase
    .from("finance_categories")
    .select("id, kind, name, system_key, archived")
    .eq("org_id", orgId)
    .order("kind")
    .order("sort_order")
    .order("name");
  if (error) {
    console.error("listCategories failed:", error);
    throw new Error("No se pudieron cargar las categorías.");
  }
  return data.map((c) => ({ id: c.id, kind: c.kind, name: c.name, systemKey: c.system_key, archived: c.archived }));
}

export type LedgerFilters = {
  month?: string; // YYYY-MM, cash basis (occurred_on)
  kind?: Row["kind"];
  categoryId?: string;
  unitId?: string; // a unit id
  general?: boolean; // only entries not tied to a unit
};

// Newest first. Staff get only their own rows from RLS, so the same call serves
// both roles. `truncated` tells the UI the month has more than LEDGER_LIMIT rows.
export async function listEntries(
  supabase: Client,
  orgId: string,
  filters: LedgerFilters = {}
): Promise<{ entries: LedgerEntry[]; truncated: boolean }> {
  let query = supabase.from("finance_entries").select(COLUMNS).eq("org_id", orgId);
  if (filters.month) {
    const range = monthRange(filters.month);
    if (range) query = query.gte("occurred_on", range.from).lt("occurred_on", range.toExclusive);
  }
  if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.unitId) query = query.eq("unit_id", filters.unitId);
  if (filters.general) query = query.is("unit_id", null);
  const { data, error } = await query
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id")
    .limit(LEDGER_LIMIT + 1);
  if (error) {
    console.error("listEntries failed:", error);
    throw new Error("No se pudieron cargar los movimientos.");
  }
  return { entries: data.slice(0, LEDGER_LIMIT).map(toEntry), truncated: data.length > LEDGER_LIMIT };
}

// Costs (commission, cleaning...) linked to the given rentals, whatever month
// they fall in: a stay's cleaning is dated on check-out and can land in the next
// month, but the stay's profit needs it. RLS still scopes the rows.
export async function listLinkedCosts(supabase: Client, orgId: string, rentalIds: string[]): Promise<LedgerEntry[]> {
  if (rentalIds.length === 0) return [];
  const { data, error } = await supabase
    .from("finance_entries")
    .select(COLUMNS)
    .eq("org_id", orgId)
    .eq("kind", "expense")
    .in("related_entry_id", rentalIds);
  if (error) {
    console.error("listLinkedCosts failed:", error);
    throw new Error("No se pudieron cargar los costos del alquiler.");
  }
  return data.map(toEntry);
}

export async function getEntry(supabase: Client, orgId: string, id: string): Promise<LedgerEntry | null> {
  const { data, error } = await supabase.from("finance_entries").select(COLUMNS).eq("org_id", orgId).eq("id", id).maybeSingle();
  if (error) {
    console.error("getEntry failed:", error);
    throw new Error("No se pudo cargar el movimiento.");
  }
  return data ? toEntry(data) : null;
}

// The last rate the user typed for a currency, to prefill the next form.
export async function getLastFxRate(supabase: Client, orgId: string, currency: Row["currency"]): Promise<number | null> {
  const { data, error } = await supabase
    .from("finance_entries")
    .select("fx_rate_pen")
    .eq("org_id", orgId)
    .eq("currency", currency)
    .not("fx_rate_pen", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error("getLastFxRate failed:", error);
    return null;
  }
  return data[0]?.fx_rate_pen ?? null;
}

// Suggested cleaning cost per unit (cents, property currency) + that currency.
export async function getCleaningDefaults(
  supabase: Client,
  orgId: string
): Promise<{ currency: Row["currency"] | null; byUnit: Record<string, number> }> {
  const [settings, property] = await Promise.all([
    supabase.from("finance_unit_settings").select("unit_id, cleaning_cost_cents").eq("org_id", orgId),
    supabase.from("properties").select("currency").eq("org_id", orgId).maybeSingle(),
  ]);
  if (settings.error || property.error) {
    console.error("getCleaningDefaults failed:", settings.error ?? property.error);
    return { currency: null, byUnit: {} };
  }
  const byUnit: Record<string, number> = {};
  for (const row of settings.data) {
    if (row.cleaning_cost_cents !== null) byUnit[row.unit_id] = row.cleaning_cost_cents;
  }
  return { currency: property.data?.currency ?? null, byUnit };
}

// ─── Writes ─────────────────────────────────────────────────────────────────

function entryColumns(input: EntryForm, receiptPath?: string) {
  return {
    category_id: input.categoryId,
    occurred_on: input.occurredOn,
    amount_cents: input.amount,
    currency: input.currency,
    fx_rate_pen: input.fxRate === undefined ? null : Number(input.fxRate),
    unit_id: input.unitId ?? null,
    payment_method: input.paymentMethod ?? null,
    counterparty: input.counterparty ?? null,
    note: input.note ?? null,
    ...(receiptPath === undefined ? {} : { receipt_path: receiptPath }),
  };
}

export async function createEntry(
  supabase: Client,
  orgId: string,
  input: EntryForm,
  receiptPath?: string
): Promise<Result<{ id: string }>> {
  const { data, error } = await supabase
    .from("finance_entries")
    .insert({ ...entryColumns(input, receiptPath), org_id: orgId, kind: input.kind })
    .select("id")
    .single();
  if (error) {
    console.error("createEntry failed:", error);
    return { ok: false };
  }
  return { ok: true, id: data.id };
}

// kind cannot change (it is pinned to the category by the table); a category of
// the other kind is rejected by the composite FK. Pass receiptPath only to
// replace the receipt: the new row value is saved first and the previous object
// is removed afterwards, so a failure never leaves the entry pointing at a
// removed file. undefined leaves the receipt untouched.
export async function updateEntry(
  supabase: Client,
  orgId: string,
  id: string,
  input: EntryForm,
  receiptPath?: string
): Promise<Result> {
  let previous: string | null = null;
  if (receiptPath !== undefined) {
    const { data, error } = await supabase.from("finance_entries").select("receipt_path").eq("org_id", orgId).eq("id", id).maybeSingle();
    if (error || !data) {
      if (error) console.error("updateEntry lookup failed:", error);
      return { ok: false };
    }
    previous = data.receipt_path;
  }
  const { data, error } = await supabase
    .from("finance_entries")
    .update(entryColumns(input, receiptPath))
    .eq("org_id", orgId)
    .eq("id", id)
    .select("id");
  if (error || data.length !== 1) {
    console.error("updateEntry failed:", error ?? `expected 1 row, got ${data?.length}`);
    return { ok: false };
  }
  if (previous && previous !== receiptPath) await removeReceipt(supabase, previous);
  return { ok: true };
}

// Row first, then the receipt object: a failed row delete must not leave an
// entry pointing at a removed file, while a leftover private object is harmless
// and only logged.
export async function deleteEntry(supabase: Client, orgId: string, id: string): Promise<Result> {
  const { data: current, error: readError } = await supabase
    .from("finance_entries")
    .select("receipt_path")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (readError || !current) {
    if (readError) console.error("deleteEntry lookup failed:", readError);
    return { ok: false };
  }
  const { data: deleted, error } = await supabase
    .from("finance_entries")
    .delete()
    .eq("org_id", orgId)
    .eq("id", id)
    .select("id");
  if (error || deleted.length !== 1) {
    console.error("deleteEntry failed:", error ?? `expected 1 row, got ${deleted?.length}`);
    return { ok: false };
  }
  if (current.receipt_path) await removeReceipt(supabase, current.receipt_path);
  return { ok: true };
}

// One atomic call: the rental plus its optional commission and cleaning, linked
// (public.create_rental_entries, SECURITY INVOKER — RLS applies to every insert).
export async function createRental(supabase: Client, input: RentalForm, receiptPath?: string): Promise<Result<{ id: string }>> {
  const { data, error } = await supabase.rpc("create_rental_entries", {
    p_unit_id: input.unitId,
    p_stay_start: input.stayStart,
    p_stay_end: input.stayEnd,
    p_channel: input.channel,
    p_occurred_on: input.occurredOn,
    p_amount_cents: input.amount,
    p_currency: input.currency,
    p_guests: input.guests,
    p_guest_name: input.guestName,
    p_fx_rate_pen: input.fxRate === undefined ? undefined : Number(input.fxRate),
    p_payment_method: input.paymentMethod,
    p_receipt_path: receiptPath,
    p_note: input.note,
    p_commission_cents: input.commission,
    p_cleaning_cents: input.cleaning,
  });
  if (error || typeof data !== "string") {
    console.error("createRental failed:", error ?? "no id returned");
    return { ok: false };
  }
  return { ok: true, id: data };
}

// ─── Receipts (always the session client: storage policies apply) ───────────

export async function uploadReceipt(supabase: Client, path: string, bytes: Uint8Array, contentType: string): Promise<boolean> {
  const { error } = await supabase.storage.from(RECEIPTS_BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (error) {
    console.error("uploadReceipt failed:", error);
    return false;
  }
  return true;
}

export async function removeReceipt(supabase: Client, path: string): Promise<boolean> {
  const { data, error } = await supabase.storage.from(RECEIPTS_BUCKET).remove([path]);
  if (error || data.length < 1) {
    console.error("removeReceipt failed:", error ?? "object not removed (missing or not permitted)");
    return false;
  }
  return true;
}

// Short-lived link. createSignedUrl needs the SELECT policy, so a staff member
// can only sign receipts they uploaded even if they forge a receipt_path.
export async function signReceipt(supabase: Client, orgId: string, entryId: string, seconds = 60): Promise<string | null> {
  const { data: entry, error } = await supabase
    .from("finance_entries")
    .select("receipt_path")
    .eq("org_id", orgId)
    .eq("id", entryId)
    .maybeSingle();
  if (error || !entry?.receipt_path) {
    if (error) console.error("signReceipt lookup failed:", error);
    return null;
  }
  const { data, error: signError } = await supabase.storage.from(RECEIPTS_BUCKET).createSignedUrl(entry.receipt_path, seconds);
  if (signError || !data) {
    console.error("signReceipt failed:", signError);
    return null;
  }
  return data.signedUrl;
}
