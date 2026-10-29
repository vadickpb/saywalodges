import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { isExportToken, type FeedForm, type IcalChannel } from "@/lib/domain/ical-feeds";
import { exportPayloadSchema, type ExportPayload } from "@/lib/ical/export";

// Calendar feeds (SD-304). Management is owner-only (RLS): the export token is a
// secret URL. The public export goes through get_ical_export, a database
// function that takes the token and returns date ranges only; nothing here uses
// the service role.

type Client = SupabaseClient<Database>;
type Result<T = object> = ({ ok: true } & T) | { ok: false };

export type IcalFeed = {
  id: string;
  unitId: string;
  channel: IcalChannel;
  exportToken: string;
  importUrl: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
};

const COLUMNS = "id, unit_id, channel, export_token, import_url, last_synced_at, last_error";

export async function listFeeds(supabase: Client, orgId: string): Promise<IcalFeed[]> {
  const { data, error } = await supabase.from("ical_feeds").select(COLUMNS).eq("org_id", orgId).order("created_at").order("id");
  if (error) {
    console.error("listFeeds failed:", error);
    throw new Error("No se pudieron cargar los calendarios.");
  }
  return data.map((f) => ({
    id: f.id,
    unitId: f.unit_id,
    channel: f.channel,
    exportToken: f.export_token,
    importUrl: f.import_url,
    lastSyncedAt: f.last_synced_at,
    lastError: f.last_error,
  }));
}

export async function createFeed(supabase: Client, orgId: string, input: FeedForm): Promise<Result<{ id: string }>> {
  const { data, error } = await supabase
    .from("ical_feeds")
    .insert({ org_id: orgId, unit_id: input.unitId, channel: input.channel })
    .select("id")
    .single();
  if (error) {
    console.error("createFeed failed:", error);
    return { ok: false };
  }
  return { ok: true, id: data.id };
}

// RLS filtering a delete returns 0 rows with no error, so the count is checked.
export async function deleteFeed(supabase: Client, orgId: string, id: string): Promise<Result> {
  const { data, error } = await supabase.from("ical_feeds").delete().eq("org_id", orgId).eq("id", id).select("id");
  if (error || data.length !== 1) {
    console.error("deleteFeed failed:", error ?? "no row deleted");
    return { ok: false };
  }
  return { ok: true };
}

// The old URL stops working at once.
export async function regenerateToken(supabase: Client, orgId: string, id: string): Promise<Result> {
  const { data, error } = await supabase.rpc("regenerate_ical_token", { p_org_id: orgId, p_feed_id: id });
  if (error || typeof data !== "string") {
    console.error("regenerateToken failed:", error ?? "no token returned");
    return { ok: false };
  }
  return { ok: true };
}

// Public read by token. null = unknown or malformed token (the route answers 404);
// a payload that does not look like what the function promises is an error.
export async function getIcalExport(supabase: Client, token: string): Promise<ExportPayload | null> {
  if (!isExportToken(token)) return null;
  const { data, error } = await supabase.rpc("get_ical_export", { p_token: token });
  if (error) {
    console.error("getIcalExport failed:", error);
    throw new Error("No se pudo generar el calendario.");
  }
  if (data === null) return null;
  const parsed = exportPayloadSchema.safeParse(data);
  if (!parsed.success) {
    console.error("getIcalExport: unexpected payload shape");
    throw new Error("No se pudo generar el calendario.");
  }
  return parsed.data;
}
