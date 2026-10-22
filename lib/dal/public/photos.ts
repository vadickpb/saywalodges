import "server-only";
import { cache } from "react";
import { getSupabaseAnon } from "@/lib/supabase/anon";
import { getPublicPhotoUrl } from "@/lib/storage";

export interface PhotosConfig {
  hero: string;
  gallery: string[];
}

// Hero + top-level gallery photos (role in ('hero','gallery'), space_id null).
// Room-specific photos are handled separately by lib/dal/public/spaces.ts.
export const getPhotosConfig = cache(async (propertyId: string): Promise<PhotosConfig> => {
  const { data, error } = await getSupabaseAnon()
    .from("photos")
    .select("storage_path, role, sort_order")
    .eq("property_id", propertyId)
    .is("space_id", null)
    .in("role", ["hero", "gallery"])
    .order("sort_order");

  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const hero = rows.find((p) => p.role === "hero");
  const gallery = rows.filter((p) => p.role === "gallery");

  return {
    hero: hero ? getPublicPhotoUrl(hero.storage_path) : "",
    gallery: gallery.map((p) => getPublicPhotoUrl(p.storage_path)),
  };
});
