import Link from "next/link";
import { getPricingData } from "@/lib/dal/rates";
import { FEE_LABELS, formatPrice, type PricingSection } from "@/lib/domain/rates-management";
import { RowAction } from "@/components/dashboard/row-action";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { deletePricingAction } from "./actions";

export const SECTION_LABELS = { rates: "Tarifas por unidad", seasons: "Temporadas", fees: "Cargos" };
export async function PricingList({ section }: { section: PricingSection }) {
  const data = await getPricingData();
  if (!data) return <p>No tienes una propiedad activa.</p>;
  const unitName = (id: string) => data.units.find((u) => u.id === id)?.name ?? "Unidad eliminada";
  const rows = section === "seasons" ? data.seasons.map((s) => ({
    id: s.id, title: s.name, detail: `${s.startDate} → ${s.endDate} (fin excluido) · Prioridad ${s.priority}`,
  })) : section === "fees" ? data.fees.map((f) => ({
    id: f.id, title: `${unitName(f.unitId)} · ${f.name}`, detail: `${formatPrice(f.amountCents, data.currency)} · ${FEE_LABELS[f.kind]}`,
  })) : data.rates.map((r) => ({
    id: r.id, title: `${unitName(r.unitId)} · ${r.seasonId ? data.seasons.find((s) => s.id === r.seasonId)?.name ?? "Temporada eliminada" : "Tarifa base"}`,
    detail: `${formatPrice(r.nightlyCents, data.currency)}/noche · Vie/sáb: ${formatPrice(r.weekendNightlyCents ?? r.nightlyCents, data.currency)} · Extra: ${formatPrice(r.extraGuestCents, data.currency)}/huésped/noche · Mínimo ${r.minNights} noche(s)`,
  }));
  return <Card><CardHeader><CardTitle>{SECTION_LABELS[section]}</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="text-sm text-muted-foreground">Moneda de la propiedad: {data.currency}.</p>
    {section === "seasons" && <p className="text-sm text-muted-foreground">Gana la prioridad más alta. Cada unidad necesita una tarifa para las temporadas que cubran sus fechas; si falta, no se puede cotizar.</p>}
    {section !== "seasons" && data.units.length === 0 ? <Link className="underline" href="/app/site/units">Primero crea una unidad</Link> : <Link className="inline-flex rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" href={`/app/rates/${section}/new`}>Añadir {section === "rates" ? "tarifa" : section === "seasons" ? "temporada" : "cargo"}</Link>}
    {rows.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay registros.</p>}
    <ul className="divide-y">{rows.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div className="min-w-0"><p className="font-medium break-words">{row.title}</p><p className="text-sm text-muted-foreground">{row.detail}</p></div>
      <div className="flex items-center gap-3"><Link className="text-sm underline" href={`/app/rates/${section}/${row.id}`} aria-label={`Editar ${row.title}`}>Editar</Link>
        <RowAction action={deletePricingAction} fields={{ id: row.id, section }} label="Eliminar" variant="destructive" size="sm" confirm={{ title: `Eliminar ${row.title}`, description: section === "seasons" ? "También se eliminarán las tarifas de esta temporada. La tarifa base se conserva. Revisa los precios antes de volver a cotizar." : "Se eliminará este registro. Revisa los precios antes de volver a cotizar." }} />
      </div>
    </li>)}</ul>
  </CardContent></Card>;
}
