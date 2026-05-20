import fs from "fs/promises";
import path from "path";

// ─── Static metadata for each space ─────────────────────────────────────────
// Add/edit spaces here. "id" must match the key in public/spaces.json.

export type SpaceMeta = {
  id: string;
  folder: string;
  category: "pool" | "rooms" | "common" | "outdoor";
  icon: string;
  label: { en: string; es: string };
  desc: { en: string; es: string };
  capacity?: string; // e.g. "2 personas", "Hasta 4"
  badge?: { en: string; es: string }; // e.g. "Suite principal"
};

export const SPACES_META: SpaceMeta[] = [
  {
    id: "pool",
    folder: "pool",
    category: "pool",
    icon: "🏊",
    label: { en: "Heated Pool & Hot Tub", es: "Piscina Temperada & Hidromasaje" },
    desc: {
      en: "Covered heated pool with hot tub and panoramic views of the Sacred Valley mountains.",
      es: "Piscina cubierta y temperada con hidromasaje y vistas panorámicas a las montañas del Valle Sagrado.",
    },
  },
  {
    id: "suite",
    folder: "suite",
    category: "rooms",
    icon: "🛏️",
    label: { en: "Patio Room", es: "Habitación Patio" },
    desc: {
      en: "Double bed, private bathroom with hot shower, and views of the patio and mountains. First floor.",
      es: "Cama de 2 plazas, baño privado con ducha de agua caliente y vista al patio y las montañas. Primer piso.",
    },
    capacity: "2",
  },
  {
    id: "queen-a",
    folder: "queen-a",
    category: "rooms",
    icon: "🛏️",
    label: { en: "Panoramic Queen Room", es: "Habitación Panorámica Queen" },
    desc: {
      en: "Queen bed, private bathroom and terrace with panoramic mountain views. Second floor.",
      es: "Cama queen, baño privado y terraza con vista panorámica a las montañas. Segundo piso.",
    },
    capacity: "2",
  },
  {
    id: "queen-b",
    folder: "queen-b",
    category: "rooms",
    icon: "🛏️",
    label: { en: "Terrace Queen Room", es: "Habitación Terraza Queen" },
    desc: {
      en: "Queen bed, private bathroom, terrace and views of the mountains and patio. Second floor.",
      es: "Cama queen, baño privado, terraza y vista a las montañas y al patio. Segundo piso.",
    },
    capacity: "2",
  },
  {
    id: "queen-c",
    folder: "queen-c",
    category: "rooms",
    icon: "🏔️",
    label: { en: "Valley View Room", es: "Habitación Mirador del Valle" },
    desc: {
      en: "2 full-size beds, large panoramic window and access to a rooftop terrace with sweeping Sacred Valley views. Shared bathroom.",
      es: "2 camas de plaza y media, amplio ventanal tipo mirador y acceso a terraza superior con vista panorámica al Valle Sagrado. Baño compartido.",
    },
    capacity: "3–4",
    badge: { en: "Valley views", es: "Vista al Valle" },
  },
  {
    id: "bunks",
    folder: "bunks",
    category: "rooms",
    icon: "👨‍👩‍👧‍👦",
    label: { en: "Family Room with Bunks", es: "Habitación Familiar con Literas" },
    desc: {
      en: "Full-size bed plus 2 bunk beds, private bathroom, terrace and views of the patio and mountains. Ideal for families and groups.",
      es: "Cama de plaza y media, 2 literas, baño privado, terraza y vista al patio y las montañas. Ideal para familias, niños o grupos.",
    },
    capacity: "5–6",
    badge: { en: "Ideal for families", es: "Ideal para familias" },
  },
  {
    id: "living",
    folder: "living",
    category: "common",
    icon: "🏡",
    label: { en: "Living & Dining Area", es: "Sala & Comedor" },
    desc: {
      en: "Cozy common area with Andean décor, dining table and fully equipped kitchen.",
      es: "Zona común acogedora con decoración andina, mesa de comedor y cocina completamente equipada.",
    },
  },
  {
    id: "garden",
    folder: "garden",
    category: "outdoor",
    icon: "🌿",
    label: { en: "Gardens & Green Fields", es: "Jardines & Campo Verde" },
    desc: {
      en: "Spacious green gardens with panoramic views of the Andean mountains.",
      es: "Amplios jardines verdes con vistas panorámicas a las montañas andinas.",
    },
  },
  {
    id: "bbq",
    folder: "bbq",
    category: "outdoor",
    icon: "🔥",
    label: { en: "BBQ & Clay Oven", es: "Parrilla & Horno de Barro" },
    desc: {
      en: "Outdoor BBQ grill and traditional clay oven surrounded by the garden.",
      es: "Parrilla exterior y horno de barro tradicional rodeados por el jardín.",
    },
  },
  {
    id: "exterior",
    folder: "exterior",
    category: "outdoor",
    icon: "🏔️",
    label: { en: "Lodge Exterior", es: "Exterior del Lodge" },
    desc: {
      en: "Lodge exterior with Andean architecture, gardens and mountain backdrop.",
      es: "Exterior del lodge con arquitectura andina, jardines y montañas de fondo.",
    },
  },
];

export const SPACE_CATEGORIES = [
  { id: "all",     label: { en: "All spaces",    es: "Todos"         } },
  { id: "pool",    label: { en: "Pool",           es: "Piscina"       } },
  { id: "rooms",   label: { en: "Rooms",          es: "Habitaciones"  } },
  { id: "common",  label: { en: "Common areas",   es: "Áreas comunes" } },
  { id: "outdoor", label: { en: "Outdoor",        es: "Exterior"      } },
] as const;

// ─── Runtime: read photos from public/spaces.json ────────────────────────────

type SpacesConfig = {
  spaces: { id: string; folder: string; photos: string[] }[];
};

export async function getSpacesConfig(): Promise<SpacesConfig> {
  // No in-memory cache — Next.js handles request-level deduplication.
  // This ensures new photos appear immediately after spaces.json is updated.
  const file = path.join(process.cwd(), "public", "spaces.json");
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw) as SpacesConfig;
}

// Merge static metadata with dynamic photos
export async function getSpaces() {
  const config = await getSpacesConfig();
  const photoMap = Object.fromEntries(config.spaces.map((s) => [s.id, s.photos]));
  return SPACES_META.map((meta) => ({
    ...meta,
    photos: photoMap[meta.id] ?? [],
  }));
}
