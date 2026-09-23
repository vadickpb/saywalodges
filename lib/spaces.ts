import { getSupabase, getPublicPhotoUrl } from "./supabase";

// ─── Static UI chrome — category taxonomy, not property content ─────────────

export const SPACE_CATEGORIES = [
  { id: "all",     label: { en: "All spaces",    es: "Todos"         } },
  { id: "pool",    label: { en: "Pool",           es: "Piscina"       } },
  { id: "rooms",   label: { en: "Rooms",          es: "Habitaciones"  } },
  { id: "common",  label: { en: "Common areas",   es: "Áreas comunes" } },
  { id: "outdoor", label: { en: "Outdoor",        es: "Exterior"      } },
] as const;

export type SpaceMeta = {
  id: string;
  category: "pool" | "rooms" | "common" | "outdoor";
  icon: string;
  label: { en: string; es: string };
  desc: { en: string; es: string };
  capacity?: string;
  badge?: { en: string; es: string };
};

export type SpaceWithPhotos = SpaceMeta & { photos: string[] };

// ─── Runtime: rooms + their photos from Supabase ─────────────────────────────

export async function getSpaces(propertyId: string): Promise<SpaceWithPhotos[]> {
  const supabase = getSupabase();

  const [{ data: rooms, error: roomsError }, { data: photos, error: photosError }] =
    await Promise.all([
      supabase
        .from("rooms")
        .select("*")
        .eq("property_id", propertyId)
        .order("sort_order"),
      supabase
        .from("photos")
        .select("room_id, storage_path, sort_order")
        .eq("property_id", propertyId)
        .eq("role", "room")
        .order("sort_order"),
    ]);

  if (roomsError) throw new Error(roomsError.message);
  if (photosError) throw new Error(photosError.message);

  const photosByRoom = new Map<string, string[]>();
  for (const p of photos ?? []) {
    if (!p.room_id) continue;
    const list = photosByRoom.get(p.room_id) ?? [];
    list.push(getPublicPhotoUrl(p.storage_path));
    photosByRoom.set(p.room_id, list);
  }

  return (rooms ?? []).map((r) => ({
    id: r.key,
    category: r.category,
    icon: r.icon,
    label: { en: r.label_en, es: r.label_es },
    desc: { en: r.desc_en, es: r.desc_es },
    capacity: r.capacity ?? undefined,
    badge: r.badge_en && r.badge_es ? { en: r.badge_en, es: r.badge_es } : undefined,
    photos: photosByRoom.get(r.id) ?? [],
  }));
}
