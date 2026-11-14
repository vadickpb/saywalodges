import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { createClient } from "@/lib/supabase/server";
import { getUnit, listUnitComponents, listUnits } from "@/lib/dal/units";
import { SHOWCASE_TYPES, SHOWCASE_TYPE_LABELS, UNIT_KINDS, UNIT_KIND_LABELS } from "@/lib/domain/units";
import { ContentForm, type ContentField } from "@/components/dashboard/content-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { saveUnit } from "../actions";
import { CombinedUnitForm } from "@/components/dashboard/combined-unit-form";

const FIELDS: ContentField[] = [
  { name: "name", label: "Nombre", maxLength: 200, width: "full" },
  { name: "kind", label: "Tipo de reserva", kind: "select", options: UNIT_KINDS.map((kind) => ({ value: kind, label: UNIT_KIND_LABELS[kind] })) },
  { name: "showcaseType", label: "Tipo visible en la web", kind: "select", options: SHOWCASE_TYPES.map((type) => ({ value: type, label: SHOWCASE_TYPE_LABELS[type] })) },
  { name: "active", label: "Estado", kind: "select", options: [{ value: "true", label: "Activa" }, { value: "false", label: "Inactiva" }] },
  { name: "maxGuests", label: "Capacidad máxima de huéspedes", kind: "number", min: 1, max: 2147483647, step: 1 },
  { name: "includedGuests", label: "Huéspedes incluidos en la tarifa base", kind: "number", min: 1, max: 2147483647, step: 1 },
  { name: "descriptionEs", label: "Descripción (es)", kind: "textarea", maxLength: 2000 },
  { name: "descriptionEn", label: "Descripción (en)", kind: "textarea", maxLength: 2000 },
  { name: "bedrooms", label: "Dormitorios", kind: "number", min: 0, max: 50, step: 1 },
  { name: "beds", label: "Camas", kind: "number", min: 0, max: 100, step: 1 },
  { name: "bathrooms", label: "Baños", kind: "number", min: 0, max: 50, step: 1 },
  { name: "sortOrder", label: "Orden en la web", kind: "number", min: 0, max: 2147483647, step: 1 },
  { name: "bedDetailsEs", label: "Detalle de camas (es)", maxLength: 300 },
  { name: "bedDetailsEn", label: "Detalle de camas (en)", maxLength: 300 },
];

export default async function UnitEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";
  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg || (!isNew && !z.uuid().safeParse(id).success)) notFound();
  const unit = isNew ? null : await getUnit(await createClient(), activeOrg.id, id);
  if (!isNew && !unit) notFound();
  const combination = unit && activeOrg.role === "owner" ? await listUnitComponents(unit.id) : null;
  const units = combination ? await listUnits(await createClient(), activeOrg.id) : [];
  const initial = unit
    ? {
        name: unit.name, kind: unit.kind, maxGuests: String(unit.maxGuests), includedGuests: String(unit.includedGuests), active: String(unit.active),
        showcaseType: unit.showcaseType, descriptionEs: unit.descriptionEs, descriptionEn: unit.descriptionEn,
        bedrooms: String(unit.bedrooms), beds: String(unit.beds), bedDetailsEs: unit.bedDetailsEs, bedDetailsEn: unit.bedDetailsEn,
        bathrooms: String(unit.bathrooms), sortOrder: String(unit.sortOrder),
      }
    : {
        name: "", kind: "entire_place", maxGuests: "1", includedGuests: "1", active: "true", showcaseType: "house",
        descriptionEs: "", descriptionEn: "", bedrooms: "1", beds: "1", bedDetailsEs: "", bedDetailsEn: "", bathrooms: "1", sortOrder: "0",
      };
  return (
    <Card>
      <CardHeader><CardTitle>{isNew ? "Nueva unidad" : `Editar ${unit?.name}`}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">La capacidad máxima limita la ocupación. Los huéspedes incluidos indican cuántos cubre la tarifa base; las tarifas se configuran por separado.</p>
        <ContentForm fields={FIELDS} initial={initial} action={saveUnit} id={unit?.id} submitLabel={isNew ? "Crear unidad" : "Guardar cambios"} />
        {unit && activeOrg.role === "owner" && combination && (
          <section className="space-y-4 border-t pt-6" aria-labelledby={combination.parentUnitId ? undefined : "unit-components-title"}>
            {combination.parentUnitId ? (
              <p className="rounded-md border bg-muted/40 p-3 text-sm">Esta unidad forma parte de «{units.find((candidate) => candidate.id === combination.parentUnitId)?.name ?? "otra unidad"}».</p>
            ) : <>
              <div className="space-y-2">
                <h2 id="unit-components-title" className="font-semibold">Esta unidad se compone de…</h2>
                <p className="text-sm text-muted-foreground">Úsalo para la «Villa completa»: cuando se reserve la villa, las casas se bloquean solas, y cuando se reserve una casa, la villa aparece ocupada. Dos casas sí pueden reservarse a la vez.</p>
              </div>
              <CombinedUnitForm unitId={unit.id} units={units.filter((candidate) => candidate.id !== unit.id && candidate.active)} selected={combination.childUnitIds} />
            </>}
          </section>
        )}
        <Link href="/app/site/units" className="text-sm text-primary hover:underline">Volver a unidades</Link>
      </CardContent>
    </Card>
  );
}
