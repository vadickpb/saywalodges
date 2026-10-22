import { requireActiveOrg } from "@/lib/dal/organizations";
import { listDistances, type DistanceItem } from "@/lib/dal/content";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContentForm, type ContentField } from "@/components/dashboard/content-form";
import { RowAction } from "@/components/dashboard/row-action";
import { deleteDistanceAction, moveDistanceAction, saveDistance } from "./actions";

const FIELDS: ContentField[] = [
  { name: "placeEs", label: "Lugar (es)", maxLength: 200 },
  { name: "placeEn", label: "Lugar (en)", maxLength: 200 },
  { name: "timeEs", label: "Tiempo (es, ej. 15 min)", maxLength: 200 },
  { name: "timeEn", label: "Tiempo (en, ej. 15 min)", maxLength: 200 },
  { name: "icon", label: "Ícono (emoji)", maxLength: 10 },
];

const toInitial = (i: DistanceItem) => ({ placeEn: i.placeEn, placeEs: i.placeEs, timeEn: i.timeEn, timeEs: i.timeEs, icon: i.icon });

export default async function DistancesPage() {
  const { activeOrg } = await requireActiveOrg();
  const items = activeOrg ? await listDistances(await createClient(), activeOrg.id) : [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-foreground">Distancias</h1>
      <ul className="flex flex-col gap-3">
        {items.map((item, index) => (
          <li key={item.id}>
            <Card>
              <CardContent className="flex flex-col gap-4 pt-6">
                <ContentForm fields={FIELDS} initial={toInitial(item)} action={saveDistance} id={item.id} submitLabel="Guardar" />
                <div className="flex items-center gap-1 border-t border-border pt-3">
                  <RowAction action={moveDistanceAction} fields={{ id: item.id, direction: "up" }} label="↑" ariaLabel="Subir" disabled={index === 0} />
                  <RowAction action={moveDistanceAction} fields={{ id: item.id, direction: "down" }} label="↓" ariaLabel="Bajar" disabled={index === items.length - 1} />
                  <RowAction
                    action={deleteDistanceAction}
                    fields={{ id: item.id }}
                    label="Eliminar"
                    variant="destructive"
                    confirm={{ title: "¿Eliminar este elemento?", description: "No se puede deshacer." }}
                    successMessage="Eliminado"
                  />
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      <Card>
        <CardHeader>
          <CardTitle>Agregar</CardTitle>
        </CardHeader>
        <CardContent>
          <ContentForm fields={FIELDS} initial={{}} action={saveDistance} submitLabel="Agregar" resetOnSuccess successMessage="Agregado" />
        </CardContent>
      </Card>
    </div>
  );
}
