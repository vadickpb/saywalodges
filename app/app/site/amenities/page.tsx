import { requireActiveOrg } from "@/lib/dal/organizations";
import { listAmenities, type AmenityItem } from "@/lib/dal/content";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContentForm, type ContentField } from "@/components/dashboard/content-form";
import { RowAction } from "@/components/dashboard/row-action";
import { deleteAmenityAction, moveAmenityAction, saveAmenity } from "./actions";

const FIELDS: ContentField[] = [
  { name: "titleEs", label: "Título (es)", maxLength: 200 },
  { name: "titleEn", label: "Título (en)", maxLength: 200 },
  { name: "icon", label: "Ícono (emoji)", maxLength: 20 },
  { name: "descEs", label: "Descripción (es)", kind: "textarea", maxLength: 2000 },
  { name: "descEn", label: "Descripción (en)", kind: "textarea", maxLength: 2000 },
];

const toInitial = (i: AmenityItem) => ({ icon: i.icon, titleEn: i.titleEn, titleEs: i.titleEs, descEn: i.descEn, descEs: i.descEs });

export default async function AmenitiesPage() {
  const { activeOrg } = await requireActiveOrg();
  const items = activeOrg ? await listAmenities(await createClient(), activeOrg.id) : [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-foreground">Comodidades</h1>
      <ul className="flex flex-col gap-3">
        {items.map((item, index) => (
          <li key={item.id}>
            <Card>
              <CardContent className="flex flex-col gap-4 pt-6">
                <ContentForm fields={FIELDS} initial={toInitial(item)} action={saveAmenity} id={item.id} submitLabel="Guardar" />
                <div className="flex items-center gap-1 border-t border-border pt-3">
                  <RowAction action={moveAmenityAction} fields={{ id: item.id, direction: "up" }} label="↑" ariaLabel="Subir" disabled={index === 0} />
                  <RowAction action={moveAmenityAction} fields={{ id: item.id, direction: "down" }} label="↓" ariaLabel="Bajar" disabled={index === items.length - 1} />
                  <RowAction
                    action={deleteAmenityAction}
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
          <ContentForm fields={FIELDS} initial={{}} action={saveAmenity} submitLabel="Agregar" resetOnSuccess successMessage="Agregado" />
        </CardContent>
      </Card>
    </div>
  );
}
