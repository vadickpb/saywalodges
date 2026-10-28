import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { ConfirmForm, RecurringTemplate, TemplateForm } from "@/lib/domain/finance-recurring";
import { monthRange } from "@/lib/domain/finance-view";

// Recurring expenses (SD-806), owner-only: RLS lets only the owner of the org see
// or touch templates and confirmations, and the pages check the role first.
// Session client only; orgId comes from requireActiveOrg(). Failures are logged
// and reported as a generic {ok:false}.

type Client = SupabaseClient<Database>;
type Row = Database["public"]["Tables"]["finance_recurring"]["Row"];
type Result<T = object> = ({ ok: true } & T) | { ok: false };

const COLUMNS =
  "id, name, category_id, unit_id, day_of_month, estimated_cents, currency, counterparty, payment_method, active, starts_month";

function toTemplate(r: Pick<Row, "id" | "name" | "category_id" | "unit_id" | "day_of_month" | "estimated_cents" | "currency" | "counterparty" | "payment_method" | "active" | "starts_month">): RecurringTemplate {
  return {
    id: r.id,
    name: r.name,
    categoryId: r.category_id,
    unitId: r.unit_id,
    dayOfMonth: r.day_of_month,
    estimatedCents: r.estimated_cents,
    currency: r.currency,
    counterparty: r.counterparty,
    paymentMethod: r.payment_method,
    active: r.active,
    startsMonth: r.starts_month.slice(0, 7),
  };
}

export async function listTemplates(supabase: Client, orgId: string): Promise<RecurringTemplate[]> {
  const { data, error } = await supabase
    .from("finance_recurring")
    .select(COLUMNS)
    .eq("org_id", orgId)
    .order("name")
    .order("id");
  if (error) {
    console.error("listTemplates failed:", error);
    throw new Error("No se pudieron cargar los gastos recurrentes.");
  }
  return data.map(toTemplate);
}

export async function getTemplate(supabase: Client, orgId: string, id: string): Promise<RecurringTemplate | null> {
  const { data, error } = await supabase.from("finance_recurring").select(COLUMNS).eq("org_id", orgId).eq("id", id).maybeSingle();
  if (error) {
    console.error("getTemplate failed:", error);
    throw new Error("No se pudo cargar el gasto recurrente.");
  }
  return data ? toTemplate(data) : null;
}

function columns(input: TemplateForm) {
  return {
    name: input.name,
    category_id: input.categoryId,
    unit_id: input.unitId ?? null,
    day_of_month: input.dayOfMonth,
    estimated_cents: input.amount,
    currency: input.currency,
    counterparty: input.counterparty ?? null,
    payment_method: input.paymentMethod ?? null,
  };
}

export async function createTemplate(supabase: Client, orgId: string, input: TemplateForm): Promise<Result<{ id: string }>> {
  const { data, error } = await supabase.from("finance_recurring").insert({ ...columns(input), org_id: orgId }).select("id").single();
  if (error) {
    console.error("createTemplate failed:", error);
    return { ok: false };
  }
  return { ok: true, id: data.id };
}

// RLS filtering a write returns 0 rows with no error, so the count is checked.
export async function updateTemplate(supabase: Client, orgId: string, id: string, input: TemplateForm): Promise<Result> {
  const { data, error } = await supabase.from("finance_recurring").update(columns(input)).eq("org_id", orgId).eq("id", id).select("id");
  if (error || data.length !== 1) {
    console.error("updateTemplate failed:", error ?? "no row updated");
    return { ok: false };
  }
  return { ok: true };
}

export async function setTemplateActive(supabase: Client, orgId: string, id: string, active: boolean): Promise<Result> {
  const { data, error } = await supabase.from("finance_recurring").update({ active }).eq("org_id", orgId).eq("id", id).select("id");
  if (error || data.length !== 1) {
    console.error("setTemplateActive failed:", error ?? "no row updated");
    return { ok: false };
  }
  return { ok: true };
}

// Past confirmed expenses stay; only the template (and its confirmation marks) go.
export async function deleteTemplate(supabase: Client, orgId: string, id: string): Promise<Result> {
  const { data, error } = await supabase.from("finance_recurring").delete().eq("org_id", orgId).eq("id", id).select("id");
  if (error || data.length !== 1) {
    console.error("deleteTemplate failed:", error ?? "no row deleted");
    return { ok: false };
  }
  return { ok: true };
}

// Template ids already confirmed for each of the given months ("YYYY-MM").
export async function listConfirmed(supabase: Client, orgId: string, months: readonly string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>(months.map((m) => [m, new Set<string>()]));
  const firsts = months.map((m) => monthRange(m)?.from).filter((d): d is string => d !== undefined);
  if (firsts.length === 0) return out;
  const { data, error } = await supabase
    .from("finance_recurring_runs")
    .select("recurring_id, month")
    .eq("org_id", orgId)
    .in("month", firsts);
  if (error) {
    console.error("listConfirmed failed:", error);
    throw new Error("No se pudieron cargar las confirmaciones.");
  }
  for (const run of data) out.get(run.month.slice(0, 7))?.add(run.recurring_id);
  return out;
}

// Idempotent in the database: confirming the same month twice returns the first
// expense (created: false) instead of writing another one.
export async function confirmRecurring(supabase: Client, orgId: string, input: ConfirmForm): Promise<Result<{ entryId: string; created: boolean }>> {
  const { data, error } = await supabase.rpc("confirm_recurring_expense", {
    p_org_id: orgId,
    p_recurring_id: input.recurringId,
    p_month: input.month,
    p_amount_cents: input.amount,
    p_currency: input.currency,
    p_fx_rate_pen: input.fxRate === undefined ? undefined : Number(input.fxRate),
    p_occurred_on: input.occurredOn,
  });
  const row = data?.[0];
  if (error || row === undefined) {
    console.error("confirmRecurring failed:", error ?? "no row returned");
    return { ok: false };
  }
  return { ok: true, entryId: row.out_entry_id, created: row.out_created };
}
