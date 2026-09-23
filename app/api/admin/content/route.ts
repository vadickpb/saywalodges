import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getProperty } from "@/lib/property";
import { contentPayloadSchema } from "@/lib/validation/admin";
import { serverError, validationError } from "@/lib/api-error";

// Single-tenant admin: reads/writes the one property plus its rooms, rate
// tiers, amenities and distances in one payload — mirrors the single-file
// save pattern the old photos.json admin used.

// Replaces the set of rows for `table` scoped to `propertyId`: updates rows
// whose id already exists, inserts new ones, deletes rows no longer present.
// Safe for `rooms` too — only genuinely removed rooms are deleted (which
// correctly cascades their photos); edited rooms keep their id and photos.
async function syncTable(
  table: string,
  propertyId: string,
  incoming: Array<{ id?: string } & Record<string, unknown>>
) {
  const supabase = getSupabase();
  const { data: existing, error: readError } = await supabase
    .from(table)
    .select("id")
    .eq("property_id", propertyId);
  if (readError) throw new Error(readError.message);

  const existingIds = new Set((existing ?? []).map((r) => r.id as string));
  const incomingIds = new Set(incoming.filter((r) => r.id).map((r) => r.id));

  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length) {
    const { error } = await supabase.from(table).delete().in("id", toDelete);
    if (error) throw new Error(error.message);
  }

  for (const row of incoming) {
    const { id, ...rest } = row;
    if (id && existingIds.has(id)) {
      const { error } = await supabase.from(table).update(rest).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from(table).insert({ ...rest, property_id: propertyId });
      if (error) throw new Error(error.message);
    }
  }
}

export async function GET() {
  const supabase = getSupabase();
  const property = await getProperty();

  const [rooms, rateTiers, amenities, distances] = await Promise.all([
    supabase.from("rooms").select("*").eq("property_id", property.id).order("sort_order"),
    supabase.from("rate_tiers").select("*").eq("property_id", property.id).order("sort_order"),
    supabase.from("amenities").select("*").eq("property_id", property.id).order("sort_order"),
    supabase.from("distances").select("*").eq("property_id", property.id).order("sort_order"),
  ]);

  for (const res of [rooms, rateTiers, amenities, distances]) {
    if (res.error) return serverError("admin/content GET", res.error);
  }

  return NextResponse.json({
    property,
    rooms: (rooms.data ?? []).map((r) => ({
      id: r.id,
      key: r.key,
      category: r.category,
      icon: r.icon,
      capacity: r.capacity,
      badgeEn: r.badge_en,
      badgeEs: r.badge_es,
      labelEn: r.label_en,
      labelEs: r.label_es,
      descEn: r.desc_en,
      descEs: r.desc_es,
      sortOrder: r.sort_order,
    })),
    rateTiers: (rateTiers.data ?? []).map((r) => ({
      id: r.id,
      seasonEn: r.season_en,
      seasonEs: r.season_es,
      fromEn: r.from_en,
      fromEs: r.from_es,
      periodEn: r.period_en,
      periodEs: r.period_es,
      tagEn: r.tag_en,
      tagEs: r.tag_es,
      sortOrder: r.sort_order,
    })),
    amenities: (amenities.data ?? []).map((r) => ({
      id: r.id,
      icon: r.icon,
      titleEn: r.title_en,
      titleEs: r.title_es,
      descEn: r.desc_en,
      descEs: r.desc_es,
      sortOrder: r.sort_order,
    })),
    distances: (distances.data ?? []).map((r) => ({
      id: r.id,
      placeEn: r.place_en,
      placeEs: r.place_es,
      timeEn: r.time_en,
      timeEs: r.time_es,
      icon: r.icon,
      sortOrder: r.sort_order,
    })),
  });
}

export async function PUT(request: Request) {
  const json = await request.json();
  const parsed = contentPayloadSchema.safeParse(json);
  if (!parsed.success) return validationError("admin/content PUT", parsed.error);
  const body = parsed.data;

  const property = await getProperty();
  const supabase = getSupabase();

  try {
    const { error: propertyError } = await supabase
      .from("properties")
      .update({
        name: body.property.name,
        whatsapp_number: body.property.whatsappNumber,
        whatsapp_message_en: body.property.whatsappMessageEn,
        whatsapp_message_es: body.property.whatsappMessageEs,
        email: body.property.email,
        maps_url: body.property.mapsUrl,
        airbnb_url: body.property.airbnbUrl,
        address_locality: body.property.addressLocality,
        address_region: body.property.addressRegion,
        address_country: body.property.addressCountry,
        latitude: body.property.latitude,
        longitude: body.property.longitude,
        meta_title_en: body.property.metaTitleEn,
        meta_title_es: body.property.metaTitleEs,
        meta_description_en: body.property.metaDescriptionEn,
        meta_description_es: body.property.metaDescriptionEs,
        meta_keywords_en: body.property.metaKeywordsEn,
        meta_keywords_es: body.property.metaKeywordsEs,
        price_range: body.property.priceRange,
        star_rating: body.property.starRating,
        pets_allowed: body.property.petsAllowed,
      })
      .eq("id", property.id);
    if (propertyError) throw new Error(propertyError.message);

    await syncTable(
      "rooms",
      property.id,
      body.rooms.map((r) => ({
        id: r.id,
        key: r.key,
        category: r.category,
        icon: r.icon,
        capacity: r.capacity,
        badge_en: r.badgeEn,
        badge_es: r.badgeEs,
        label_en: r.labelEn,
        label_es: r.labelEs,
        desc_en: r.descEn,
        desc_es: r.descEs,
        sort_order: r.sortOrder,
      }))
    );

    await syncTable(
      "rate_tiers",
      property.id,
      body.rateTiers.map((r) => ({
        id: r.id,
        season_en: r.seasonEn,
        season_es: r.seasonEs,
        from_en: r.fromEn,
        from_es: r.fromEs,
        period_en: r.periodEn,
        period_es: r.periodEs,
        tag_en: r.tagEn,
        tag_es: r.tagEs,
        sort_order: r.sortOrder,
      }))
    );

    await syncTable(
      "amenities",
      property.id,
      body.amenities.map((r) => ({
        id: r.id,
        icon: r.icon,
        title_en: r.titleEn,
        title_es: r.titleEs,
        desc_en: r.descEn,
        desc_es: r.descEs,
        sort_order: r.sortOrder,
      }))
    );

    await syncTable(
      "distances",
      property.id,
      body.distances.map((r) => ({
        id: r.id,
        place_en: r.placeEn,
        place_es: r.placeEs,
        time_en: r.timeEn,
        time_es: r.timeEs,
        icon: r.icon,
        sort_order: r.sortOrder,
      }))
    );
  } catch (err) {
    return serverError("admin/content PUT", err);
  }

  return NextResponse.json({ ok: true });
}
