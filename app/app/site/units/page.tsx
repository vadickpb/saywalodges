import Link from "next/link";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { createClient } from "@/lib/supabase/server";
import { listUnits } from "@/lib/dal/units";
import { UNIT_KIND_LABELS } from "@/lib/domain/units";
import { RowAction } from "@/components/dashboard/row-action";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { deleteUnitAction, setUnitActiveAction } from "./actions";

export default async function UnitsPage() {
  const { activeOrg } = await requireActiveOrg();
  const units = activeOrg ? await listUnits(await createClient(), activeOrg.id) : [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Unidades reservables</h1>
        {activeOrg && <Button asChild size="sm"><Link href="/app/site/units/new">Nueva unidad</Link></Button>}
      </div>
      <p className="text-sm text-muted-foreground">Configura lo que pueden reservar tus huéspedes: una casa completa o una habitación. Las unidades inactivas no estarán disponibles para cotizar.</p>
      {units.length === 0 ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">Todavía no hay unidades reservables.</CardContent></Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {units.map((unit) => (
            <li key={unit.id}>
              <Card><CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/app/site/units/${unit.id}`} className="break-words font-medium text-primary hover:underline">{unit.name}</Link>
                    <Badge variant={unit.active ? "default" : "secondary"}>{unit.active ? "Activa" : "Inactiva"}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{UNIT_KIND_LABELS[unit.kind]} · Hasta {unit.maxGuests} huéspedes · {unit.includedGuests} incluidos en la tarifa base</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm"><Link href={`/app/site/units/${unit.id}`}>Editar</Link></Button>
                  <RowAction action={setUnitActiveAction} fields={{ id: unit.id, active: String(!unit.active) }} label={unit.active ? "Desactivar" : "Activar"} ariaLabel={`${unit.active ? "Desactivar" : "Activar"} ${unit.name}`} />
                  <RowAction action={deleteUnitAction} fields={{ id: unit.id }} label="Eliminar" ariaLabel={`Eliminar ${unit.name}`} variant="destructive" confirm={{ title: "¿Eliminar unidad?", description: `Se eliminará ${unit.name}. Esta acción no se puede deshacer.` }} />
                </div>
              </CardContent></Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
