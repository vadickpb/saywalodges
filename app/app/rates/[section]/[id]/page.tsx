import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getPricingData } from "@/lib/dal/rates";
import { pricingSectionSchema, centsToInput, FEE_LABELS } from "@/lib/domain/rates-management";
import { ContentForm, type ContentField } from "@/components/dashboard/content-form";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { savePricingAction } from "../../actions";
import { SECTION_LABELS } from "../../_components";

export default async function PricingEditPage({ params }: { params: Promise<{ section: string; id: string }> }) {
  const { section: rawSection, id } = await params;
  const parsed = pricingSectionSchema.safeParse(rawSection);
  if (!parsed.success || (id !== "new" && !z.uuid().safeParse(id).success)) notFound();
  const section = parsed.data;
  const data = await getPricingData();
  if (!data) return <p>No tienes una propiedad activa.</p>;
  const editing = id !== "new";
  const record = data[section].find((r) => r.id === id);
  if (editing && !record) notFound();
  let fields: ContentField[];
  let initial: Record<string, string>;
  const units = data.units.filter((u) => !record || !("unitId" in record) || u.id === record.unitId).map((u) => ({ value: u.id, label: `${u.name}${u.active ? "" : " (inactiva)"}` }));
  const unitField: ContentField = { name: "unitId", label: "Unidad", kind: "select", options: [{ value: "", label: "Selecciona una unidad" }, ...units] };
  if (section === "seasons") {
    const season = data.seasons.find((s) => s.id === id);
    fields = [
      { name: "name", label: "Nombre", maxLength: 200 },
      { name: "priority", label: "Prioridad (gana la más alta)", kind: "number", min: 0, step: 1 },
      { name: "startDate", label: "Inicio (incluido)", kind: "date" },
      { name: "endDate", label: "Fin (primer día sin esta temporada)", kind: "date" },
    ];
    initial = { name: season?.name ?? "", priority: String(season?.priority ?? 0), startDate: season?.startDate ?? "", endDate: season?.endDate ?? "" };
  } else if (section === "rates") {
    const rate = data.rates.find((r) => r.id === id);
    fields = [unitField,
      { name: "seasonId", label: "Temporada", kind: "select", options: [{ value: "", label: "Tarifa base (fuera de temporadas)" }, ...data.seasons.map((s) => ({ value: s.id, label: s.name }))] },
      { name: "nightlyAmount", label: `Precio por noche (${data.currency})`, maxLength: 12 },
      { name: "weekendAmount", label: `Viernes/sábado (${data.currency}; vacío = precio normal)`, maxLength: 12 },
      { name: "extraAmount", label: `Por huésped extra y noche (${data.currency})`, maxLength: 12 },
      { name: "minNights", label: "Mínimo de noches al llegar", kind: "number", min: 1, step: 1 },
    ];
    initial = { unitId: rate?.unitId ?? "", seasonId: rate?.seasonId ?? "", nightlyAmount: rate ? centsToInput(rate.nightlyCents) : "", weekendAmount: rate?.weekendNightlyCents != null ? centsToInput(rate.weekendNightlyCents) : "", extraAmount: centsToInput(rate?.extraGuestCents ?? 0), minNights: String(rate?.minNights ?? 1) };
  } else {
    const fee = data.fees.find((f) => f.id === id);
    fields = [unitField, { name: "name", label: "Nombre del cargo", maxLength: 200 },
      { name: "kind", label: "Cómo se cobra", kind: "select", options: Object.entries(FEE_LABELS).map(([value, label]) => ({ value, label })) },
      { name: "amount", label: `Importe (${data.currency})`, maxLength: 12 },
    ];
    initial = { unitId: fee?.unitId ?? "", name: fee?.name ?? "", kind: fee?.kind ?? "per_stay", amount: fee ? centsToInput(fee.amountCents) : "" };
  }
  const back = section === "rates" ? "/app/rates" : `/app/rates/${section}`;
  return <Card><CardHeader><CardTitle>{editing ? "Editar" : "Añadir"} · {SECTION_LABELS[section]}</CardTitle></CardHeader><CardContent className="space-y-4">
    <Link className="text-sm underline" href={back}>Volver al listado</Link>
    {section === "seasons" && <p className="text-sm text-muted-foreground">No se permiten temporadas que se crucen con la misma prioridad. Después de crearla, añade su tarifa en cada unidad.</p>}
    {section === "rates" && <p className="text-sm text-muted-foreground">Los huéspedes incluidos se configuran en Sitio → Unidades. El mínimo se toma de la tarifa de la noche de llegada.</p>}
    <ContentForm fields={fields} initial={initial} action={savePricingAction.bind(null, section)} id={editing ? id : undefined} submitLabel="Guardar" />
  </CardContent></Card>;
}
