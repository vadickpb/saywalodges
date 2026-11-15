import Link from "next/link";
import { notFound } from "next/navigation";
import { FINANCE_CSV_TEMPLATE } from "@/lib/domain/finance-csv-import";
import { getFinanceContext } from "../_lib/context";
import { FinanceCsvImportForm } from "./import-form";

export default async function FinanceCsvImportPage() {
  const ctx = await getFinanceContext();
  if (!ctx || !ctx.isOwner) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <Link href="/app/finance" className="text-sm underline">← Volver a Finanzas</Link>
      <h1 className="text-xl font-semibold">Importar ingresos y gastos</h1>
      <p className="text-sm text-muted-foreground">
        Usa las columnas fecha, tipo, categoria, monto, moneda, descripcion, proveedor, metodo y casa.
        La fecha puede ser AAAA-MM-DD o DD/MM/AAAA y el tipo debe ser «ingreso» o «gasto».
      </p>
      <p className="text-sm text-muted-foreground">
        La categoría se busca por nombre; si no existe, el movimiento irá a «Otros ingresos» u «Otros egresos».
        Casa debe ser el nombre exacto de una casa o quedar vacío. Puedes reimportar el mismo archivo: lo ya importado no se duplica.
      </p>
      <FinanceCsvImportForm template={FINANCE_CSV_TEMPLATE} />
      <Link href="/app/finance/importar" className="text-sm underline">Importar historial de Airbnb →</Link>
    </div>
  );
}
