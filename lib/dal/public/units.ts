import "server-only";
import { cache } from "react";
import { getSupabaseAnon } from "@/lib/supabase/anon";

// Data source for the future public quote builder (SD-402/404). Inactive
// units never appear here, even if a caller knows their id; RLS also limits
// anonymous reads to active units of published properties.
export const getActiveUnits = cache(async (propertyId: string) => {
  const { data, error } = await getSupabaseAnon().from("units")
    .select("id, name, kind, max_guests, included_guests")
    .eq("property_id", propertyId).eq("active", true).order("created_at").order("id");
  if (error) {
    console.error("getActiveUnits failed:", error);
    throw new Error("No se pudieron cargar las unidades disponibles.");
  }
  return data;
});
