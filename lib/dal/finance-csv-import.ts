import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/database.types";
import type { FinanceCsvRow } from "@/lib/domain/finance-csv-import";

// SD-420: writes the parsed income/expense CSV into the ledger through the owner-only RPC (role and org are checked
// inside the database; session client only). Failures are logged and reported as a generic {ok:false}.
type Client = SupabaseClient<Database>;

const resultSchema = z.object({
  inserted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  uncategorized: z.number().int().nonnegative(),
});
export type FinanceCsvImportResult = z.infer<typeof resultSchema>;

export async function importFinanceRows(
  supabase: Client, orgId: string, rows: FinanceCsvRow[], fxRate: number | undefined,
): Promise<{ ok: true; result: FinanceCsvImportResult } | { ok: false }> {
  const { data, error } = await supabase.rpc("import_finance_rows", {
    p_org_id: orgId,
    p_rows: JSON.parse(JSON.stringify(rows)),
    p_fx_rate_pen: fxRate,
  });
  const parsed = resultSchema.safeParse(data);
  if (error || !parsed.success) {
    console.error("importFinanceRows failed:", error ?? "unexpected response");
    return { ok: false };
  }
  return { ok: true, result: parsed.data };
}
