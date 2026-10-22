import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { createClient } from "@/lib/supabase/server";
import { getUnit } from "@/lib/dal/units";
import { UNIT_KINDS, UNIT_KIND_LABELS } from "@/lib/domain/units";
import { ContentForm, type ContentField } from "@/components/dashboard/content-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { saveUnit } from "../actions";

const FIELDS: ContentField[] = [
  { name: "name", label: "Nombre", maxLength: 200, width: "full" },
  { name: "kind", label: "Tipo", kind: "select", options: UNIT_KINDS.map((kind) => ({ value: kind, label: UNIT_KIND_LABELS[kind] })) },
  { name: "active", label: "Estado", kind: "select", options: [{ value: "true", label: "Activa" }, { value: "false", label: "Inactiva" }] },
  { name: "maxGuests", label: "Capacidad máxima de huéspedes", kind: "number", min: 1, max: 2147483647, step: 1 },
  { name: "includedGuests", label: "Huéspedes incluidos en la tarifa base", kind: "number", min: 1, max: 2147483647, step: 1 },
];

export default async function UnitEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";
  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg || (!isNew && !z.uuid().safeParse(id).success)) notFound();
  const unit = isNew ? null : await getUnit(await createClient(), activeOrg.id, id);
  if (!isNew && !unit) notFound();
  const initial = unit
    ? { name: unit.name, kind: unit.kind, maxGuests: String(unit.maxGuests), includedGuests: String(unit.includedGuests), active: String(unit.active) }
    : { name: "", kind: "entire_place", maxGuests: "1", includedGuests: "1", active: "true" };
  return (
    <Card>
      <CardHeader><CardTitle>{isNew ? "Nueva unidad" : `Editar ${unit?.name}`}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">La capacidad máxima limita la ocupación. Los huéspedes incluidos indican cuántos cubre la tarifa base; las tarifas se configuran por separado.</p>
        <ContentForm fields={FIELDS} initial={initial} action={saveUnit} id={unit?.id} submitLabel={isNew ? "Crear unidad" : "Guardar cambios"} />
        <Link href="/app/site/units" className="text-sm text-primary hover:underline">Volver a unidades</Link>
      </CardContent>
    </Card>
  );
}
