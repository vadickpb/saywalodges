import Link from "next/link";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { listSpaces } from "@/lib/dal/content";
import { createClient } from "@/lib/supabase/server";
import { SPACE_CATEGORY_LABELS } from "@/lib/domain/content-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RowAction } from "@/components/dashboard/row-action";
import { deleteSpaceAction, moveSpaceAction } from "./actions";

export default async function SpacesPage() {
  const { activeOrg } = await requireActiveOrg();
  const spaces = activeOrg ? await listSpaces(await createClient(), activeOrg.id) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Espacios</h1>
        <Button asChild size="sm">
          <Link href="/app/site/spaces/new">Nuevo espacio</Link>
        </Button>
      </div>
      {spaces.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">Todavía no hay espacios.</CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {spaces.map((space, index) => (
            <li key={space.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-3 py-3">
                  <span aria-hidden className="text-xl">{space.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{space.labelEs}</p>
                    <p className="truncate text-sm text-muted-foreground">{space.labelEn}</p>
                  </div>
                  <Badge variant="secondary">{SPACE_CATEGORY_LABELS[space.category]}</Badge>
                  <div className="flex items-center gap-1">
                    <RowAction action={moveSpaceAction} fields={{ id: space.id, direction: "up" }} label="↑" ariaLabel={`Subir ${space.labelEs}`} disabled={index === 0} />
                    <RowAction action={moveSpaceAction} fields={{ id: space.id, direction: "down" }} label="↓" ariaLabel={`Bajar ${space.labelEs}`} disabled={index === spaces.length - 1} />
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/app/site/spaces/${space.id}`}>Editar</Link>
                    </Button>
                    <RowAction
                      action={deleteSpaceAction}
                      fields={{ id: space.id }}
                      label="Eliminar"
                      variant="destructive"
                      confirm={{
                        title: `¿Eliminar "${space.labelEs}"?`,
                        description: "También se borrarán todas sus fotos, de la base de datos y del almacenamiento. No se puede deshacer.",
                      }}
                      successMessage="Espacio eliminado"
                    />
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
