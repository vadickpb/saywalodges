import Link from "next/link";
import { getFinanceContext } from "@/app/app/finance/_lib/context";
import { getPricingData } from "@/lib/dal/rates";
import { UnitsImportForm } from "./import-form";

export default async function UnitsImportPage() {
  const ctx = await getFinanceContext();
  const backLink = <Link href="/app/site/units" className="text-sm underline">← Volver a Unidades reservables</Link>;
  if (!ctx?.isOwner) {
    return <div className="flex flex-col gap-5">{backLink}<p>Solo el dueño puede importar casas y tarifas.</p></div>;
  }
  const pricing = await getPricingData();
  if (!pricing) {
    return <div className="flex flex-col gap-5">{backLink}<p>No tienes una propiedad activa.</p></div>;
  }

  return (
    <div className="flex min-w-0 max-w-6xl flex-col gap-5">
      {backLink}
      <h1 className="text-xl font-semibold">Importar casas y tarifas</h1>
      <p className="text-sm text-muted-foreground">
        Descarga la plantilla y completa una fila por casa o habitación. Escribe los precios en {pricing.currency},
        con punto decimal y sin símbolo de moneda. Revisa la vista previa antes de guardar.
        Si el nombre coincide con una casa existente, se actualizarán sus datos y su tarifa base.
      </p>
      <UnitsImportForm currency={pricing.currency} />
    </div>
  );
}
