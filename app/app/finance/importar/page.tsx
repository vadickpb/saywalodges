import Link from "next/link";
import { notFound } from "next/navigation";
import { listImportUnits } from "@/lib/dal/finance-airbnb-import";
import { getFinanceContext } from "../_lib/context";
import { AirbnbImportForm } from "./import-form";

export default async function AirbnbImportPage() {
  const ctx = await getFinanceContext();
  if (!ctx || !ctx.isOwner) notFound();
  const units = await listImportUnits(ctx.supabase, ctx.orgId);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <Link href="/app/finance" className="text-sm underline">← Volver a Finanzas</Link>
      <h1 className="text-xl font-semibold">Importar historial de Airbnb</h1>
      <p className="text-sm text-muted-foreground">
        Descarga tu CSV en Airbnb: Menú → Ganancias → Descargar CSV. Usa fechas M/D/YYYY (mes/día/año).
        Puedes volver a importar el mismo archivo con seguridad: las reservas duplicadas no se registran otra vez.
      </p>
      <AirbnbImportForm units={units} />
    </div>
  );
}
