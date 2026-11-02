import "server-only";
import { log } from "@/lib/log";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { healthSnapshotSchema, type HealthSnapshot } from "@/lib/domain/health";

// Health snapshot (SD-1004). Service-role on purpose: health_snapshot() is granted to service_role only and is
// called from the authenticated /api/health route, never from a page or a user action. Read-only; it returns
// counts and one migration version (no ids or personal data).
export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  const { data, error } = await getSupabaseAdmin().rpc("health_snapshot");
  if (error) {
    log("error", "health.rpc_failed", { code: error.code });
    throw new Error("health_snapshot failed");
  }
  const parsed = healthSnapshotSchema.safeParse(data);
  if (!parsed.success) {
    log("error", "health.bad_result");
    throw new Error("health_snapshot failed");
  }
  return parsed.data;
}
