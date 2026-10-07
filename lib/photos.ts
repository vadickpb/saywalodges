import { getSupabase, getPublicPhotoUrl } from "./supabase";

export interface PhotosConfig {
  hero: string;
  gallery: string[];
}

// Hero + top-level gallery photos (role in ('hero','gallery'), room_id null).
// Room-specific photos are handled separately by lib/spaces.ts.
export async function getPhotosConfig(propertyId: string): Promise<PhotosConfig> {
  const { data, error } = await getSupabase()
    .from("photos")
    .select("storage_path, role, sort_order")
    .eq("property_id", propertyId)
    .is("room_id", null)
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
}
