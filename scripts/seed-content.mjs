// One-time content migration for SD-001: loads the real Saywa Lodges content
// (recovered from git history — the previous local JSON/images source of truth)
// into the already-created Supabase schema, and uploads the real photos to
// Storage. Safe to re-run: it upserts the property by slug and replaces its
// child rows, so running it twice does not duplicate data.
//
// Usage:
//   node --env-file=.env.local scripts/seed-content.mjs [--images-dir <path>]
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
// This script is intentionally not wired into `npm run` — it is meant to run
// once against the live project. Once Fase 0 / SD-002 lands a proper
// supabase/seed.sql for local dev, this file can be deleted.

import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const imagesDirFlagIndex = args.indexOf("--images-dir");
const IMAGES_DIR =
  imagesDirFlagIndex !== -1 && args[imagesDirFlagIndex + 1]
    ? args[imagesDirFlagIndex + 1]
    : null;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.");
  console.error("Run with: node --env-file=.env.local scripts/seed-content.mjs --images-dir <path>");
  process.exit(1);
}

if (!IMAGES_DIR) {
  console.error("Missing --images-dir <path> pointing to the extracted real photos.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const PROPERTY_SLUG = "saywa-lodges";
const BUCKET = "property-photos";

// ─── Content recovered from git history (pre-Supabase commit) ───────────────

const property = {
  slug: PROPERTY_SLUG,
  name: "Saywa Lodges",
  whatsapp_number: "51963416766",
  whatsapp_message_en:
    "Hi! I'm interested in booking Saywa Lodges in Valle Sagrado, Urubamba. Could you please share availability and rates?",
  whatsapp_message_es:
    "Hola! Me interesa reservar en Saywa Lodges en el Valle Sagrado, Urubamba. ¿Podrían compartirme disponibilidad y tarifas?",
  email: "reservas@saywalodges.com",
  maps_url: "https://maps.app.goo.gl/yQ9UMCuHZ6jZvxHJ9",
  airbnb_url: "",
  site_url: "https://saywalodges.com",
  address_locality: "Urubamba",
  address_region: "Cusco",
  address_country: "PE",
  latitude: -13.3162,
  longitude: -72.1263,
  meta_title_en: "Saywa Lodges · Valle Sagrado, Cusco, Perú",
  meta_title_es: "Saywa Lodges · Valle Sagrado, Cusco, Perú",
  meta_description_en:
    "Private vacation lodge in Urubamba, Sacred Valley of the Incas. Private pool, Andean mountain views and access to Machu Picchu from $180/night.",
  meta_description_es:
    "Lodge vacacional privado en Urubamba, Valle Sagrado de los Incas. Piscina privada, vistas a montañas andinas y acceso a Machu Picchu desde $180/noche.",
  meta_keywords_en: [
    "sacred valley lodge",
    "vacation rental cusco",
    "urubamba accommodation",
    "private pool peru",
    "near machu picchu",
    "saywa lodges",
  ],
  meta_keywords_es: [
    "lodge valle sagrado",
    "alquiler vacacional cusco",
    "urubamba hospedaje",
    "piscina privada peru",
    "cerca machu picchu",
    "saywa lodges",
  ],
  price_range: "$$",
  star_rating: 4,
  pets_allowed: false,
};

const rooms = [
  {
    key: "pool",
    category: "pool",
    icon: "🏊",
    label_en: "Heated Pool & Hot Tub",
    label_es: "Piscina Temperada & Hidromasaje",
    desc_en:
      "Covered heated pool with hot tub and panoramic views of the Sacred Valley mountains.",
    desc_es:
      "Piscina cubierta y temperada con hidromasaje y vistas panorámicas a las montañas del Valle Sagrado.",
    capacity: null,
    badge_en: null,
    badge_es: null,
  },
  {
    key: "suite",
    category: "rooms",
    icon: "🛏️",
    label_en: "Patio Room",
    label_es: "Habitación Patio",
    desc_en:
      "Double bed, private bathroom with hot shower, and views of the patio and mountains. First floor.",
    desc_es:
      "Cama de 2 plazas, baño privado con ducha de agua caliente y vista al patio y las montañas. Primer piso.",
    capacity: "2",
    badge_en: null,
    badge_es: null,
  },
  {
    key: "queen-a",
    category: "rooms",
    icon: "🛏️",
    label_en: "Panoramic Queen Room",
    label_es: "Habitación Panorámica Queen",
    desc_en:
      "Queen bed, private bathroom and terrace with panoramic mountain views. Second floor.",
    desc_es:
      "Cama queen, baño privado y terraza con vista panorámica a las montañas. Segundo piso.",
    capacity: "2",
    badge_en: null,
    badge_es: null,
  },
  {
    key: "queen-b",
    category: "rooms",
    icon: "🛏️",
    label_en: "Terrace Queen Room",
    label_es: "Habitación Terraza Queen",
    desc_en:
      "Queen bed, private bathroom, terrace and views of the mountains and patio. Second floor.",
    desc_es:
      "Cama queen, baño privado, terraza y vista a las montañas y al patio. Segundo piso.",
    capacity: "2",
    badge_en: null,
    badge_es: null,
  },
  {
    key: "queen-c",
    category: "rooms",
    icon: "🏔️",
    label_en: "Valley View Room",
    label_es: "Habitación Mirador del Valle",
    desc_en:
      "2 full-size beds, large panoramic window and access to a rooftop terrace with sweeping Sacred Valley views. Shared bathroom.",
    desc_es:
      "2 camas de plaza y media, amplio ventanal tipo mirador y acceso a terraza superior con vista panorámica al Valle Sagrado. Baño compartido.",
    capacity: "3–4",
    badge_en: "Valley views",
    badge_es: "Vista al Valle",
  },
  {
    key: "bunks",
    category: "rooms",
    icon: "👨‍👩‍👧‍👦",
    label_en: "Family Room with Bunks",
    label_es: "Habitación Familiar con Literas",
    desc_en:
      "Full-size bed plus 2 bunk beds, private bathroom, terrace and views of the patio and mountains. Ideal for families and groups.",
    desc_es:
      "Cama de plaza y media, 2 literas, baño privado, terraza y vista al patio y las montañas. Ideal para familias, niños o grupos.",
    capacity: "5–6",
    badge_en: "Ideal for families",
    badge_es: "Ideal para familias",
  },
  {
    key: "living",
    category: "common",
    icon: "🏡",
    label_en: "Living & Dining Area",
    label_es: "Sala & Comedor",
    desc_en:
      "Cozy common area with Andean décor, dining table and fully equipped kitchen.",
    desc_es:
      "Zona común acogedora con decoración andina, mesa de comedor y cocina completamente equipada.",
    capacity: null,
    badge_en: null,
    badge_es: null,
  },
  {
    key: "garden",
    category: "outdoor",
    icon: "🌿",
    label_en: "Gardens & Green Fields",
    label_es: "Jardines & Campo Verde",
    desc_en: "Spacious green gardens with panoramic views of the Andean mountains.",
    desc_es: "Amplios jardines verdes con vistas panorámicas a las montañas andinas.",
    capacity: null,
    badge_en: null,
    badge_es: null,
  },
  {
    key: "bbq",
    category: "outdoor",
    icon: "🔥",
    label_en: "BBQ & Clay Oven",
    label_es: "Parrilla & Horno de Barro",
    desc_en: "Outdoor BBQ grill and traditional clay oven surrounded by the garden.",
    desc_es: "Parrilla exterior y horno de barro tradicional rodeados por el jardín.",
    capacity: null,
    badge_en: null,
    badge_es: null,
  },
  {
    key: "exterior",
    category: "outdoor",
    icon: "🏔️",
    label_en: "Lodge Exterior",
    label_es: "Exterior del Lodge",
    desc_en: "Lodge exterior with Andean architecture, gardens and mountain backdrop.",
    desc_es: "Exterior del lodge con arquitectura andina, jardines y montañas de fondo.",
    capacity: null,
    badge_en: null,
    badge_es: null,
  },
].map((r, i) => ({ ...r, sort_order: i }));

const rateTiers = [
  {
    season_en: "Low season",
    season_es: "Temporada baja",
    from_en: "from USD 220",
    from_es: "desde USD 220",
    period_en: "per night",
    period_es: "noche",
    tag_en: "",
    tag_es: "",
  },
  {
    season_en: "High season",
    season_es: "Temporada alta",
    from_en: "from USD 300",
    from_es: "desde USD 300",
    period_en: "per night",
    period_es: "noche",
    tag_en: "Jun – Sep",
    tag_es: "Jun – Sep",
  },
  {
    season_en: "Holidays & special dates",
    season_es: "Feriados y fechas especiales",
    from_en: "On request",
    from_es: "Consultar",
    period_en: "",
    period_es: "",
    tag_en: "Subject to availability",
    tag_es: "Según disponibilidad",
  },
  {
    season_en: "7 nights or more",
    season_es: "Estadías de 7 noches o más",
    from_en: "Special rate",
    from_es: "Tarifa especial",
    period_en: "",
    period_es: "",
    tag_en: "Extended stay",
    tag_es: "Estadía prolongada",
  },
].map((r, i) => ({ ...r, sort_order: i }));

const amenities = [
  {
    icon: "🏊",
    title_en: "Private Pool",
    title_es: "Piscina Privada",
    desc_en: "Exclusive pool with panoramic views of the Sacred Valley.",
    desc_es: "Piscina exclusiva con vistas panorámicas al Valle Sagrado.",
  },
  {
    icon: "🍳",
    title_en: "Full Kitchen",
    title_es: "Cocina Completa",
    desc_en: "Fully equipped kitchen with everything you need to cook your meals.",
    desc_es: "Cocina equipada con todo lo necesario para preparar tus comidas.",
  },
  {
    icon: "🏔️",
    title_en: "Mountain Views",
    title_es: "Vistas a Montañas",
    desc_en: "Breathtaking Andean landscapes from every corner of the lodge.",
    desc_es: "Paisajes andinos imponentes desde cada rincón del lodge.",
  },
  {
    icon: "🏡",
    title_en: "Private Lodge",
    title_es: "Lodge Privado",
    desc_en: "Exclusive property. Just for you and your companions.",
    desc_es: "Propiedad exclusiva. Solo para ti y tus acompañantes.",
  },
  {
    icon: "🌄",
    title_en: "Sacred Valley",
    title_es: "Valle Sagrado",
    desc_en: "In the heart of the Sacred Valley of the Incas, Urubamba.",
    desc_es: "En el corazón del Valle Sagrado de los Incas, Urubamba.",
  },
  {
    icon: "🗿",
    title_en: "Near Machu Picchu",
    title_es: "Cerca Machu Picchu",
    desc_en: "1.5 hours from the world's most famous citadel.",
    desc_es: "A 1.5 horas de la ciudadela más famosa del mundo.",
  },
].map((a, i) => ({ ...a, sort_order: i }));

const distances = [
  { place_en: "Ollantaytambo", place_es: "Ollantaytambo", time_en: "45 min", time_es: "45 min", icon: "🚗" },
  { place_en: "Cusco", place_es: "Cusco", time_en: "2 hours", time_es: "2 horas", icon: "🚗" },
  { place_en: "Machu Picchu", place_es: "Machu Picchu", time_en: "1.5 hours", time_es: "1.5 horas", icon: "🚂" },
  { place_en: "Pisac & Market", place_es: "Pisac & Mercado", time_en: "25 min", time_es: "25 min", icon: "🚗" },
  { place_en: "Urubamba River", place_es: "Río Urubamba", time_en: "5 min", time_es: "5 min", icon: "🚶" },
  { place_en: "Moray & Salt Mines", place_es: "Moray & Salineras", time_en: "30 min", time_es: "30 min", icon: "🚗" },
].map((d, i) => ({ ...d, sort_order: i }));

// Top-level (hero + gallery) photos, in the order they appeared in public/photos.json
const topLevelPhotos = [
  { file: "foto3.jpeg", role: "hero" },
  { file: "foto1.jpeg", role: "gallery" },
  { file: "foto4.jpeg", role: "gallery" },
  { file: "foto5.jpeg", role: "gallery" },
  { file: "foto6.jpeg", role: "gallery" },
  { file: "foto7.jpeg", role: "gallery" },
  { file: "foto8.jpeg", role: "gallery" },
];

// Room photos, from the old public/spaces.json manifest
const roomPhotoFiles = {
  pool: ["pool/pool-01.jpeg", "pool/pool-02.jpeg", "pool/pool-03.jpeg"],
  suite: ["suite/suite-01.jpeg"],
  "queen-a": ["queen-a/queen-a-01.jpeg", "queen-a/queen-a-02.jpeg"],
  "queen-b": ["queen-b/queen-b-01.jpeg", "queen-b/queen-b-02.jpeg"],
  "queen-c": ["queen-c/queen-c-01.jpeg", "queen-c/queen-c-02.jpeg"],
  bunks: ["bunks/bunks-01.jpeg", "bunks/bunks-02.jpeg"],
  living: ["living/living-01.jpeg", "living/living-02.jpeg", "living/living-03.jpeg"],
  garden: ["garden/garden-01.jpeg", "garden/garden-02.jpeg", "garden/garden-03.jpeg"],
  bbq: ["bbq/bbq-01.jpeg"],
  exterior: ["exterior/exterior-01.jpeg"],
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function must(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function replaceChildRows(table, propertyId, rows) {
  await must(
    await supabase.from(table).delete().eq("property_id", propertyId),
    `delete ${table}`
  );
  if (rows.length === 0) return [];
  return must(
    await supabase
      .from(table)
      .insert(rows.map((r) => ({ ...r, property_id: propertyId })))
      .select("id"),
    `insert ${table}`
  );
}

async function uploadPhoto(localRelPath, storagePath) {
  const bytes = await readFile(path.join(IMAGES_DIR, localRelPath));
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`upload ${storagePath}: ${error.message}`);
}

// ─── Run ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Upserting property "${PROPERTY_SLUG}"...`);
  const existing = await must(
    await supabase.from("properties").select("id").eq("slug", PROPERTY_SLUG).maybeSingle(),
    "read property"
  );

  const propertyId = existing
    ? must(
        await supabase
          .from("properties")
          .update(property)
          .eq("id", existing.id)
          .select("id")
          .single(),
        "update property"
      ).id
    : must(
        await supabase.from("properties").insert(property).select("id").single(),
        "insert property"
      ).id;
  console.log(`  property_id = ${propertyId}`);

  console.log("Replacing rooms, rate_tiers, amenities, distances...");
  const insertedRooms = await replaceChildRows("rooms", propertyId, rooms);
  await replaceChildRows("rate_tiers", propertyId, rateTiers);
  await replaceChildRows("amenities", propertyId, amenities);
  await replaceChildRows("distances", propertyId, distances);

  const roomIdByKey = new Map(insertedRooms.map((r, i) => [rooms[i].key, r.id]));

  console.log("Clearing existing photo rows for this property...");
  await must(
    await supabase.from("photos").delete().eq("property_id", propertyId),
    "delete photos"
  );

  console.log(`Uploading ${topLevelPhotos.length} hero/gallery photos...`);
  let sortOrder = 0;
  for (const { file, role } of topLevelPhotos) {
    const storagePath = `site/${file}`;
    await uploadPhoto(file, storagePath);
    await must(
      await supabase.from("photos").insert({
        property_id: propertyId,
        room_id: null,
        storage_path: storagePath,
        role,
        sort_order: role === "gallery" ? sortOrder++ : 0,
      }),
      `insert photo ${storagePath}`
    );
  }

  console.log("Uploading room photos...");
  for (const [key, files] of Object.entries(roomPhotoFiles)) {
    const roomId = roomIdByKey.get(key);
    if (!roomId) throw new Error(`No room found for key "${key}"`);
    for (const [i, file] of files.entries()) {
      const storagePath = `rooms/${file}`;
      await uploadPhoto(file, storagePath);
      await must(
        await supabase.from("photos").insert({
          property_id: propertyId,
          room_id: roomId,
          storage_path: storagePath,
          role: "room",
          sort_order: i,
        }),
        `insert photo ${storagePath}`
      );
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
