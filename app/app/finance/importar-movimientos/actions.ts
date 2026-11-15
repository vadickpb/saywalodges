"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { listCategories } from "@/lib/dal/finance";
import { importFinanceRows, type FinanceCsvImportResult } from "@/lib/dal/finance-csv-import";
import { listImportUnits } from "@/lib/dal/finance-airbnb-import";
import { MAX_FINANCE_CSV_BYTES, parseFinanceCsv } from "@/lib/domain/finance-csv-import";
import { GENERIC_ERROR, NO_CONTEXT_ERROR, getFinanceContext } from "../_lib/context";

// SD-420. Owner only (re-checked here and in the database). One action serves the preview (nothing is written) and
// the import: the CSV is re-parsed on the server every time, so the client never sends amounts or rows.

export type FinanceCsvImportState =
  | { ok: false; error: string }
  | {
      ok: true;
      mode: "preview";
      summary: {
        rows: number;
        totals: { PEN: { income: number; expense: number }; USD: { income: number; expense: number } };
        skipped: { line: number; reason: string }[];
        unknownCategories: string[];
        needsFxRate: boolean;
      };
    }
  | { ok: true; mode: "import"; result: FinanceCsvImportResult; skipped: number };

const optionsSchema = z.object({ mode: z.enum(["preview", "import"]), fxRate: z.string().trim().max(12).optional() });
const fail = (error: string): FinanceCsvImportState => ({ ok: false, error });
const todayLima = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

export async function financeCsvImportAction(_prev: FinanceCsvImportState | null, formData: FormData): Promise<FinanceCsvImportState> {
  const ctx = await getFinanceContext();
  if (!ctx) return fail(NO_CONTEXT_ERROR);
  if (!ctx.isOwner) return fail("Solo el dueño puede importar movimientos.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Elige el archivo CSV.");
  if (file.size > MAX_FINANCE_CSV_BYTES) return fail("El archivo supera 2 MB.");
  const options = optionsSchema.safeParse({ mode: formData.get("mode"), fxRate: formData.get("fxRate") ?? undefined });
  if (!options.success) return fail("Revisa los datos del formulario.");

  const units = await listImportUnits(ctx.supabase, ctx.orgId);
  const parsed = parseFinanceCsv(await file.text(), todayLima(), Object.fromEntries(units.map((u) => [u.name, u.id])));
  if (!parsed.ok) return fail(parsed.error);
  const fx = options.data.fxRate ? Number(options.data.fxRate.replace(",", ".")) : undefined;
  if (fx !== undefined && !(fx > 0 && fx < 100)) return fail("Tipo de cambio inválido (entre 0 y 100).");

  if (options.data.mode === "preview") {
    const categories = await listCategories(ctx.supabase, ctx.orgId);
    const known = new Set(categories.filter((c) => !c.archived).map((c) => `${c.kind}|${c.name.trim().toLowerCase()}`));
    const unknown = new Set<string>();
    for (const r of parsed.rows) {
      if (r.category && !known.has(`${r.kind}|${r.category.trim().toLowerCase()}`)) unknown.add(r.category);
    }
    return {
      ok: true, mode: "preview",
      summary: { rows: parsed.rows.length, totals: parsed.totals, skipped: parsed.skipped.slice(0, 200), unknownCategories: [...unknown].slice(0, 50), needsFxRate: parsed.needsFxRate },
    };
  }

  if (parsed.rows.length === 0) return fail("No hay filas válidas para importar.");
  if (parsed.needsFxRate && fx === undefined) return fail("Hay filas en USD: indica el tipo de cambio (S/ por 1 USD).");
  const result = await importFinanceRows(ctx.supabase, ctx.orgId, parsed.rows, fx);
  if (!result.ok) return fail(GENERIC_ERROR);
  revalidatePath("/app/finance", "layout");
  return { ok: true, mode: "import", result: result.result, skipped: parsed.skipped.length };
}
