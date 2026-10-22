import Image from "next/image";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { listSpaces } from "@/lib/dal/content";
import { getLogoUrl, listPhotos, type PhotoItem } from "@/lib/dal/photos";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RowAction } from "@/components/dashboard/row-action";
import { UploadForm } from "@/components/dashboard/upload-form";
import { deletePhotoAction, movePhotoAction, removeLogoAction, setHeroAction, uploadLogoAction, uploadPhotoAction } from "./actions";

function PhotoGrid({ photos, isSite, title }: { photos: PhotoItem[]; isSite: boolean; title: string }) {
  if (photos.length === 0) return <p className="text-sm text-muted-foreground">Sin fotos todavía.</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map((photo, index) => (
        <li key={photo.id} className="flex flex-col gap-2 rounded-md border border-border p-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded bg-muted">
            <Image src={photo.url} alt={`Foto ${index + 1} de ${title}`} fill sizes="(min-width: 1024px) 20vw, 45vw" className="object-cover" />
            {photo.role === "hero" && <Badge className="absolute left-1 top-1">Principal</Badge>}
          </div>
          <div className="flex flex-wrap gap-1">
            <RowAction action={movePhotoAction} fields={{ id: photo.id, direction: "up" }} label="←" ariaLabel={`Mover antes la foto ${index + 1} de ${title}`} size="xs" disabled={index === 0} />
            <RowAction action={movePhotoAction} fields={{ id: photo.id, direction: "down" }} label="→" ariaLabel={`Mover después la foto ${index + 1} de ${title}`} size="xs" disabled={index === photos.length - 1} />
            {isSite && photo.role !== "hero" && (
              <RowAction action={setHeroAction} fields={{ id: photo.id }} label="Principal" ariaLabel={`Usar la foto ${index + 1} de ${title} como principal`} size="xs" successMessage="Foto principal actualizada" />
            )}
            <RowAction
              action={deletePhotoAction}
              fields={{ id: photo.id }}
              label="Eliminar"
              ariaLabel={`Eliminar la foto ${index + 1} de ${title}`}
              variant="destructive"
              size="xs"
              confirm={{ title: "¿Eliminar esta foto?", description: "Se borra de la galería y del almacenamiento. No se puede deshacer." }}
              successMessage="Foto eliminada"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function PhotosPage() {
  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg) return null;
  const supabase = await createClient();
  const [photos, spaces, logoUrl] = await Promise.all([
    listPhotos(supabase, activeOrg.id),
    listSpaces(supabase, activeOrg.id),
    getLogoUrl(supabase, activeOrg.id),
  ]);
  const sitePhotos = photos.filter((p) => p.spaceId === null);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Fotos</h1>

      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {logoUrl ? (
            <div className="flex items-center gap-3">
              <Image src={logoUrl} alt="Logo actual" width={96} height={96} className="size-24 rounded border border-border object-contain" />
              <RowAction
                action={removeLogoAction}
                label="Quitar logo"
                ariaLabel="Quitar el logo"
                variant="destructive"
                confirm={{ title: "¿Quitar el logo?", description: "El sitio dejará de mostrarlo.", confirmLabel: "Quitar" }}
                successMessage="Logo eliminado"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin logo.</p>
          )}
          <UploadForm action={uploadLogoAction} label={logoUrl ? "Reemplazar logo" : "Subir logo"} inputLabel="Archivo del logo" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Portada y galería</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <PhotoGrid photos={sitePhotos} isSite title="portada y galería" />
          <UploadForm action={uploadPhotoAction} fields={{ scope: "site" }} label="Subir foto" inputLabel="Archivo de foto para portada y galería" />
        </CardContent>
      </Card>

      {spaces.map((space) => (
        <Card key={space.id}>
          <CardHeader>
            <CardTitle>{space.labelEs}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <PhotoGrid photos={photos.filter((p) => p.spaceId === space.id)} isSite={false} title={space.labelEs} />
            <UploadForm action={uploadPhotoAction} fields={{ scope: space.id }} label="Subir foto" inputLabel={`Archivo de foto para ${space.labelEs}`} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
