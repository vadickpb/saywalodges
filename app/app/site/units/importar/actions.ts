"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { importUnitsAndRates, type UnitsImportResult } from "@/lib/dal/units-import";
import { MAX_UNITS_CSV_BYTES, parseUnitsCsv, type UnitImportRow } from "@/lib/domain/units-import";
import { GENERIC_ERROR, NO_CONTEXT_ERROR, getFinanceContext } from "@/app/app/finance/_lib/context";

// SD-420. Owner only (re-checked here and in the database). One action for the preview (nothing is written) and
// the import: the CSV is re-parsed on the server each time, so the client never sends amounts.
export type UnitsImportState =
  | { ok: false; error: string }
  | { ok: true; mode: "preview"; rows: UnitImportRow[]; skipped: { line: number; reason: string }[] }
  | { ok: true; mode: "import"; result: UnitsImportResult };

const modeSchema = z.enum(["preview", "import"]);
const fail = (error: string): UnitsImportState => ({ ok: false, error });

export async function unitsImportAction(_prev: UnitsImportState | null, formData: FormData): Promise<UnitsImportState> {
  const ctx = await getFinanceContext();
  if (!ctx) return fail(NO_CONTEXT_ERROR);
  if (!ctx.isOwner) return fail("Solo el dueño puede importar casas y tarifas.");
  const mode = modeSchema.safeParse(formData.get("mode"));
  if (!mode.success) return fail("Revisa los datos del formulario.");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Elige el archivo CSV.");
  if (file.size > MAX_UNITS_CSV_BYTES) return fail("El archivo es demasiado grande.");
  const parsed = parseUnitsCsv(await file.text());
  if (!parsed.ok) return fail(parsed.error);
  if (mode.data === "preview") return { ok: true, mode: "preview", rows: parsed.rows, skipped: parsed.skipped.slice(0, 200) };
  const result = await importUnitsAndRates(ctx.supabase, ctx.orgId, parsed.rows);
  if (!result.ok) return fail(GENERIC_ERROR);
  revalidatePath("/app/site/units");
  revalidatePath("/app/rates");
  return { ok: true, mode: "import", result: result.result };
}
