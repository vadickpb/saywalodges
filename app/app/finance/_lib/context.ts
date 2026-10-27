import "server-only";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { createClient } from "@/lib/supabase/server";

// Shared by every finance page/action: the org and the caller's role come from
// requireActiveOrg() (session + real membership), never from the client. All
// data access goes through the session client, so RLS is the authority; `role`
// only decides what the UI offers (totals and profit are owner-only).
export async function getFinanceContext() {
  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg) return null;
  const supabase = await createClient();
  return { supabase, orgId: activeOrg.id, role: activeOrg.role, isOwner: activeOrg.role === "owner" };
}

export const GENERIC_ERROR = "No se pudo completar la acción. Intenta de nuevo.";
export const NO_CONTEXT_ERROR = "No tienes una organización activa.";
