import "server-only";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { getPropertyId } from "@/lib/dal/content";
import { createClient } from "@/lib/supabase/server";

// Shared by every content-manager action/page: the org comes from
// requireActiveOrg() (session + real membership), never from the client, and
// the property id is looked up under RLS. Null = no active org or no property.
export async function getSiteContext() {
  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg) return null;
  const supabase = await createClient();
  const propertyId = await getPropertyId(supabase, activeOrg.id);
  if (!propertyId) return null;
  return { supabase, orgId: activeOrg.id, propertyId };
}

export type ActionResult = { ok: true } | { ok: false; error: string };
export const GENERIC_ERROR = "No se pudo completar la acción. Intenta de nuevo.";
export const NO_CONTEXT_ERROR = "No tienes una propiedad activa.";
