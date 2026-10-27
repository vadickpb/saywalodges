import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { listAllEntries, listCategories } from "@/lib/dal/finance";
import { prepareReport, type PreparedReport, type ReportEntry, type ReportError, type ReportUnit } from "@/lib/domain/finance-reports";
import { todayInLima } from "@/lib/domain/finance-view";

// Everything a report needs, read with the SESSION client (RLS) and shaped for the
// pure engine in lib/domain/finance-reports.ts. Reports are owner-only: the page
// checks the role before calling this, and a staff member would only get their own
// rows from RLS anyway, never the whole ledger.

type Client = SupabaseClient<Database>;

export type ReportData =
  | { ok: true; prepared: PreparedReport; truncated: boolean; entryCount: number; firstYear: number | null }
  | { ok: false; error: ReportError };

// ALL houses, archived ones included: money of a house missing from the list still
// counts in the totals but disappears from the per-house table. A house's creation
// date opens its availability; an inactive one is taken to have stopped on the day
// it was last edited (the deactivation, unless it was edited again afterwards).
export async function listReportUnits(supabase: Client, orgId: string): Promise<ReportUnit[]> {
  const { data, error } = await supabase.from("units").select("id, name, active, created_at, updated_at").eq("org_id", orgId);
  if (error) {
    console.error("listReportUnits failed:", error);
    throw new Error("No se pudieron cargar las casas.");
  }
  return data.map((u) => ({
    id: u.id,
    name: u.name,
    active: u.active,
    availableFrom: todayInLima(new Date(u.created_at)),
    availableUntil: u.active ? null : todayInLima(new Date(u.updated_at)),
  }));
}

export async function loadReportData(supabase: Client, orgId: string): Promise<ReportData> {
  const [ledger, categories, units] = await Promise.all([
    listAllEntries(supabase, orgId),
    listCategories(supabase, orgId),
    listReportUnits(supabase, orgId),
  ]);
  const keyById = new Map(categories.map((c) => [c.id, c.systemKey]));
  const entries: ReportEntry[] = ledger.entries.map((e) => ({
    id: e.id,
    kind: e.kind,
    categoryId: e.categoryId,
    categoryKey: keyById.get(e.categoryId) ?? null,
    occurredOn: e.occurredOn,
    amountPenCents: e.amountPenCents,
    unitId: e.unitId,
    relatedEntryId: e.relatedEntryId,
    stayStart: e.stayStart,
    stayEnd: e.stayEnd,
    channel: e.channel,
  }));
  const prepared = prepareReport(entries, units);
  if (!prepared.ok) return { ok: false, error: prepared.error };
  const first = entries.reduce<string | null>((min, e) => (min === null || e.occurredOn < min ? e.occurredOn : min), null);
  return {
    ok: true,
    prepared: prepared.prepared,
    truncated: ledger.truncated,
    entryCount: entries.length,
    firstYear: first === null ? null : Number(first.slice(0, 4)),
  };
}
