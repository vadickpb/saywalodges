"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { importAirbnbHistory, type AirbnbImportResult } from "@/lib/dal/finance-airbnb-import";
import { MAX_AIRBNB_CSV_BYTES, parseAirbnbCsv, toImportRows } from "@/lib/domain/airbnb-import";
import { GENERIC_ERROR, NO_CONTEXT_ERROR, getFinanceContext } from "../_lib/context";

// SD-419. Owner only (re-checked here and in the database). The same action serves the preview (nothing is
// written) and the import: the CSV is re-parsed on the server each time, so the client never sends amounts.

export type AirbnbImportState =
  | { ok: false; error: string }
  | {
      ok: true;
      mode: "preview";
      summary: {
        reservations: number;
        grossCents: Record<string, number>;
        feeCents: Record<string, number>;
        payouts: { count: number; totalCents: Record<string, number> };
        skipped: { line: number; reason: string }[];
        spaces: string[];
        unmappedSpaces: string[];
        needsFxRate: boolean;
      };
    }
  | { ok: true; mode: "import"; result: AirbnbImportResult };

const optionsSchema = z.object({
  mode: z.enum(["preview", "import"]),
  mapping: z.record(z.string().max(300), z.uuid()),
  fxRate: z.string().trim().max(12).optional(),
});
const fail = (error: string): AirbnbImportState => ({ ok: false, error });

export async function airbnbImportAction(_prev: AirbnbImportState | null, formData: FormData): Promise<AirbnbImportState> {
  const ctx = await getFinanceContext();
  if (!ctx) return fail(NO_CONTEXT_ERROR);
  if (!ctx.isOwner) return fail("Solo el dueño puede importar el historial.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Elige el archivo CSV de Airbnb.");
  if (file.size > MAX_AIRBNB_CSV_BYTES) return fail("El archivo supera 2 MB.");

  let mapping: unknown = {};
  try { mapping = JSON.parse(String(formData.get("mapping") ?? "{}")); } catch { return fail("Emparejamiento inválido."); }
  const options = optionsSchema.safeParse({ mode: formData.get("mode"), mapping, fxRate: formData.get("fxRate") ?? undefined });
  if (!options.success) return fail("Revisa los datos del formulario.");

  const parsed = parseAirbnbCsv(await file.text());
  if (!parsed.ok) return fail(parsed.error);

  const { rows, unmapped } = toImportRows(parsed.reservations, options.data.mapping);
  const fx = options.data.fxRate ? Number(options.data.fxRate.replace(",", ".")) : undefined;
  if (fx !== undefined && !(fx > 0 && fx < 100)) return fail("Tipo de cambio inválido (entre 0 y 100).");
  const needsFxRate = parsed.reservations.some((r) => r.currency === "USD");

  if (options.data.mode === "preview") {
    const gross: Record<string, number> = {};
    const fee: Record<string, number> = {};
    for (const r of parsed.reservations) {
      gross[r.currency] = (gross[r.currency] ?? 0) + r.grossCents;
      fee[r.currency] = (fee[r.currency] ?? 0) + r.feeCents;
    }
    return {
      ok: true, mode: "preview",
      summary: {
        reservations: parsed.reservations.length, grossCents: gross, feeCents: fee, payouts: parsed.payouts,
        skipped: parsed.skipped.slice(0, 200), spaces: parsed.spaces,
        unmappedSpaces: [...new Set(unmapped.map((r) => r.space))], needsFxRate,
      },
    };
  }

  if (unmapped.length > 0) return fail("Empareja todos los espacios con una casa antes de importar.");
  if (rows.length === 0) return fail("No hay reservas para importar.");
  if (needsFxRate && fx === undefined) return fail("Hay reservas en USD: indica el tipo de cambio (S/ por 1 USD).");
  const result = await importAirbnbHistory(ctx.supabase, ctx.orgId, rows, fx);
  if (!result.ok) return fail(GENERIC_ERROR);
  revalidatePath("/app/finance", "layout");
  return { ok: true, mode: "import", result: result.result };
}
