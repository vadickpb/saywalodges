import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/database.types";

// SD-419: writes the parsed Airbnb history into the ledger through the owner-only RPC (role and org are
// checked inside the database; RLS-free definer function, session client only). Failures are logged and
// reported as a generic {ok:false}; the database error text never reaches the client.

type Client = SupabaseClient<Database>;

const resultSchema = z.object({
  inserted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  skipped_future: z.number().int().nonnegative(),
  commissions: z.number().int().nonnegative(),
});
export type AirbnbImportResult = { inserted: number; duplicates: number; skippedFuture: number; commissions: number };

export async function listImportUnits(supabase: Client, orgId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from("units").select("id, name").eq("org_id", orgId).order("name");
  if (error) {
    console.error("listImportUnits failed:", error);
    throw new Error("No se pudieron cargar las casas.");
  }
  return data;
}

export async function importAirbnbHistory(
  supabase: Client, orgId: string, rows: Record<string, unknown>[], fxRate: number | undefined,
): Promise<{ ok: true; result: AirbnbImportResult } | { ok: false }> {
  const { data, error } = await supabase.rpc("import_airbnb_history", {
    p_org_id: orgId,
    p_rows: JSON.parse(JSON.stringify(rows)),
    p_fx_rate_pen: fxRate,
  });
  const parsed = resultSchema.safeParse(data);
  if (error || !parsed.success) {
    console.error("importAirbnbHistory failed:", error ?? "unexpected response");
    return { ok: false };
  }
  const r = parsed.data;
  return { ok: true, result: { inserted: r.inserted, duplicates: r.duplicates, skippedFuture: r.skipped_future, commissions: r.commissions } };
}
