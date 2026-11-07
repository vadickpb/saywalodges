import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/database.types";
import type { UnitImportRow } from "@/lib/domain/units-import";

// SD-420: writes houses/rooms and their base rate through the owner-only RPC (role and org are checked in the
// database). Failures are logged and reported as a generic {ok:false}.
const resultSchema = z.object({ created: z.number().int().nonnegative(), updated: z.number().int().nonnegative() });
export type UnitsImportResult = z.infer<typeof resultSchema>;

export async function importUnitsAndRates(
  supabase: SupabaseClient<Database>, orgId: string, rows: UnitImportRow[],
): Promise<{ ok: true; result: UnitsImportResult } | { ok: false }> {
  const { data, error } = await supabase.rpc("import_units_and_rates", { p_org_id: orgId, p_rows: JSON.parse(JSON.stringify(rows)) });
  const parsed = resultSchema.safeParse(data);
  if (error || !parsed.success) {
    console.error("importUnitsAndRates failed:", error ?? "unexpected response");
    return { ok: false };
  }
  return { ok: true, result: parsed.data };
}
