import { notFound } from "next/navigation";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { getSpace } from "@/lib/dal/content";
import { createClient } from "@/lib/supabase/server";
import { SPACE_CATEGORIES, SPACE_CATEGORY_LABELS, uuidSchema } from "@/lib/domain/content-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContentForm, type ContentField } from "@/components/dashboard/content-form";
import { saveSpace } from "../actions";

const FIELDS: ContentField[] = [
  { name: "labelEs", label: "Nombre (es)", maxLength: 200 },
  { name: "labelEn", label: "Nombre (en)", maxLength: 200 },
  { name: "key", label: "Clave (minúsculas, números y guiones)", maxLength: 200 },
  {
    name: "category",
    label: "Categoría",
    kind: "select",
    options: SPACE_CATEGORIES.map((c) => ({ value: c, label: SPACE_CATEGORY_LABELS[c] })),
  },
  { name: "icon", label: "Ícono (emoji)", maxLength: 20 },
  { name: "capacity", label: "Capacidad (ej. 2 o 3–4)", maxLength: 20 },
  { name: "badgeEs", label: "Etiqueta (es, opcional)", maxLength: 200 },
  { name: "badgeEn", label: "Etiqueta (en, opcional)", maxLength: 200 },
  { name: "descEs", label: "Descripción (es)", kind: "textarea", maxLength: 2000 },
  { name: "descEn", label: "Descripción (en)", kind: "textarea", maxLength: 2000 },
];

const EMPTY = { category: "rooms", icon: "🛏️" };

export default async function SpaceEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";
  if (!isNew && !uuidSchema.safeParse(id).success) notFound();

  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg) notFound();
  const space = isNew ? null : await getSpace(await createClient(), activeOrg.id, id);
  if (!isNew && !space) notFound();

  const initial: Record<string, string> = space
    ? {
        key: space.key,
        category: space.category,
        icon: space.icon,
        capacity: space.capacity ?? "",
        badgeEn: space.badgeEn ?? "",
        badgeEs: space.badgeEs ?? "",
        labelEn: space.labelEn,
        labelEs: space.labelEs,
        descEn: space.descEn,
        descEs: space.descEs,
      }
    : EMPTY;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isNew ? "Nuevo espacio" : `Editar ${space?.labelEs}`}</CardTitle>
      </CardHeader>
      <CardContent>
        <ContentForm
          fields={FIELDS}
          initial={initial}
          action={saveSpace}
          id={space?.id}
          submitLabel={isNew ? "Crear espacio" : "Guardar cambios"}
        />
      </CardContent>
    </Card>
  );
}
