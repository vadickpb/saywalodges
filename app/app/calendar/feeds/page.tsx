import { IcalImportForm } from "@/components/dashboard/ical-import-form";
import { listSyncConflicts, SYNC_ERRORS } from "@/lib/dal/ical-sync";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { CopyButton } from "@/components/dashboard/copy-button";
import { IcalFeedForm } from "@/components/dashboard/ical-feed-form";
import { RowAction } from "@/components/dashboard/row-action";
import { listFeeds } from "@/lib/dal/ical-feeds";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { listUnits } from "@/lib/dal/units";
import { ICAL_CHANNEL_LABELS, exportUrl } from "@/lib/domain/ical-feeds";
import { createClient } from "@/lib/supabase/server";
import { createFeedAction, deleteFeedAction, regenerateFeedAction, saveImportUrlAction, syncFeedAction } from "./actions";

export default async function CalendarFeedsPage() {
  const { activeOrg } = await requireActiveOrg();
  // Owner-only: the links are secrets that expose the occupied dates.
  if (!activeOrg || activeOrg.role !== "owner") notFound();
  const supabase = await createClient();
  const [feeds, units, conflicts] = await Promise.all([listFeeds(supabase, activeOrg.id), listUnits(supabase, activeOrg.id), listSyncConflicts(supabase, activeOrg.id)]);
  const host = (await headers()).get("host") ?? "";
  const unitName = new Map(units.map((u) => [u.id, u.name]));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Calendarios para los canales</h1>
        <Link href="/app/calendar" className="text-sm text-muted-foreground hover:text-foreground">← Volver al calendario</Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Crea un enlace por casa y canal y pégalo en Airbnb, Booking.com o Google Calendar (opción «importar calendario»). Ese calendario
        incluye todas tus fechas ocupadas, menos las que vienen del propio canal, y solo muestra «Reservado»: sin nombres ni montos.
        Quien tenga el enlace puede ver tus fechas ocupadas: si se filtra, regéneralo y el anterior deja de funcionar.
      </p>

      <Card>
        <CardContent className="pt-6">
          <IcalFeedForm action={createFeedAction} units={units.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name }))} />
        </CardContent>
      </Card>

      {feeds.length === 0 ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">Todavía no hay enlaces.</CardContent></Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {feeds.map((f) => {
            const url = exportUrl(host, f.exportToken);
            const label = `${unitName.get(f.unitId) ?? "Casa"} · ${ICAL_CHANNEL_LABELS[f.channel]}`;
            return (
              <li key={f.id}>
                <Card>
                  <CardContent className="flex flex-col gap-2 py-3">
                    <p className="font-medium text-foreground">{label}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        readOnly
                        value={url}
                        aria-label={`Enlace del calendario de ${label}`}
                        className="h-9 min-w-0 flex-1 rounded-md border border-input bg-muted px-3 text-xs text-foreground"
                      />
                      <CopyButton text={url} label={`Copiar el enlace de ${label}`} />
                    </div>
                    <IcalImportForm id={f.id} url={f.importUrl} action={saveImportUrlAction} />
                    <p className="text-sm">Última sincronización: {f.lastSyncedAt ? new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Lima" }).format(new Date(f.lastSyncedAt)) : "Nunca"}</p>
                    {f.lastError && <p role="alert" className="text-sm text-destructive">{SYNC_ERRORS[f.lastError] ?? "No se pudo sincronizar el calendario."}</p>}
                    <p className="text-sm font-medium">Conflictos: {conflicts.filter((c) => c.feedId === f.id).length}</p>
                    <ul className="text-sm text-destructive">
                      {conflicts.filter((c) => c.feedId === f.id).map((c) => <li key={c.id}>Entrada {c.start} · Salida {c.end} · Solape con {c.sources.map((source) => source === "booking" ? "reserva directa" : source === "manual" ? "bloqueo manual" : "otro evento importado").join(", ")}. Revisa los canales para resolverlo.</li>)}
                    </ul>
                    <div className="flex flex-wrap items-center gap-2">
                      {f.importUrl && <RowAction action={syncFeedAction} fields={{ id: f.id }} label="Sincronizar ahora" successMessage="Calendario sincronizado" />}
                      <RowAction
                        action={regenerateFeedAction}
                        fields={{ id: f.id }}
                        label="Regenerar enlace"
                        ariaLabel={`Regenerar el enlace de ${label}`}
                        confirm={{
                          title: "¿Regenerar el enlace?",
                          description: "El enlace actual deja de funcionar: tendrás que pegar el nuevo en el canal.",
                          confirmLabel: "Regenerar",
                        }}
                        successMessage="Enlace regenerado"
                      />
                      <RowAction
                        action={deleteFeedAction}
                        fields={{ id: f.id }}
                        label="Eliminar"
                        ariaLabel={`Eliminar el enlace de ${label}`}
                        variant="destructive"
                        confirm={{ title: "¿Eliminar este enlace?", description: "El canal deja de recibir tu calendario." }}
                        successMessage="Enlace eliminado"
                      />
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
