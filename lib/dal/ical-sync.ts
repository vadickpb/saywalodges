import "server-only";
import { parseCalendarPeriod } from "@/lib/domain/calendar";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  fetchCalendar,
  parseCalendar,
  validateImportUrl,
  ImportError,
} from "@/lib/ical/import";

type Client = SupabaseClient<Database>;
const leaseSchema = z.object({ token: z.string().uuid(), url: z.string() });
export const SYNC_ERRORS: Record<string, string> = {
  URL: "El enlace o su destino no está permitido. Usa un enlace HTTPS de Airbnb, Booking.com o Vrbo.",
  NETWORK: "No se pudo descargar el calendario. Intenta de nuevo.",
  SIZE: "El calendario supera el tamaño permitido.",
  FORMAT:
    "El calendario no es válido. Se requieren eventos por fecha, sin recurrencias.",
};

export async function saveImportUrl(
  client: Client,
  orgId: string,
  id: string,
  value: string,
): Promise<boolean> {
  const url = value.trim();
  if (url) {
    try {
      validateImportUrl(url);
    } catch {
      return false;
    }
  }
  const { data, error } = await client
    .from("ical_feeds")
    .update({ import_url: url || null })
    .eq("org_id", orgId)
    .eq("id", id)
    .select("id");
  // Never log URLs, upstream errors, UID, body or database details.
  if (error) console.error("ical configure failed");
  return !error && data?.length === 1;
}

export async function syncFeed(
  client: Client,
  orgId: string,
  id: string,
): Promise<boolean> {
  const started = await client.rpc("begin_ical_sync", {
    p_org_id: orgId,
    p_feed_id: id,
  });
  const lease = leaseSchema.safeParse(started.data);
  if (started.error || !lease.success) return false;
  let events: { uid: string; start: string; end: string }[] = [];
  let code: "URL" | "NETWORK" | "SIZE" | "FORMAT" | undefined;
  try {
    events = parseCalendar(await fetchCalendar(lease.data.url));
  } catch (error) {
    code = error instanceof ImportError ? error.code : "NETWORK";
  }
  const finished = await client.rpc("finish_ical_sync", {
    p_org_id: orgId,
    p_feed_id: id,
    p_token: lease.data.token,
    p_events: events,
    ...(code ? { p_error: code } : {}),
  });
  if (finished.error) console.error("ical sync persistence failed");
  return !finished.error && finished.data === true && !code;
}

export async function listSyncConflicts(client: Client, orgId: string) {
  // Max 2000 events per feed; paginate explicitly past PostgREST's row cap.
  const rows: {
    id: string;
    feedId: string;
    start: string;
    end: string;
    sources: string[];
  }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client
      .from("sync_conflicts")
      .select("id, feed_id, period, blocking_sources")
      .eq("org_id", orgId)
      .order("id")
      .range(offset, offset + 999);
    if (error) {
      console.error("ical conflicts read failed");
      throw new Error("No se pudieron cargar los conflictos.");
    }
    rows.push(
      ...data.map((r) => ({
        id: r.id,
        feedId: r.feed_id,
        ...parseCalendarPeriod(r.period),
        sources: r.blocking_sources,
      })),
    );
    if (data.length < 1000) return rows;
  }
}
