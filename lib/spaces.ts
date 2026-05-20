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
    label: { en: "Master Suite", es: "Suite Principal" },
    desc: {
      en: "King bed, private bathroom and terrace with mountain views. Maximum comfort.",
      es: "Cama king, baño privado y terraza con vista a las montañas. Máximo confort.",
    },
    capacity: "2",
    badge: { en: "Master suite", es: "Suite principal" },
  },
  {
    id: "queen-a",
    folder: "queen-a",
    category: "rooms",
    icon: "🛏️",
    label: { en: "Queen Room A", es: "Habitación Queen A" },
    desc: {
      en: "Queen bed with private terrace and Andean mountain views.",
      es: "Cama queen con terraza privada y vistas a las montañas andinas.",
    },
    capacity: "2",
  },
  {
    id: "queen-b",
    folder: "queen-b",
    category: "rooms",
    icon: "🛏️",
    label: { en: "Queen Room B", es: "Habitación Queen B" },
    desc: {
      en: "Queen bed with terrace and garden views. Natural light all day.",
      es: "Cama queen con terraza y vista al jardín. Luz natural todo el día.",
    },
    capacity: "2",
  },
  {
    id: "queen-c",
    folder: "queen-c",
    category: "rooms",
    icon: "🛏️",
    label: { en: "Queen Room C", es: "Habitación Queen C" },
    desc: {
      en: "Queen bed with access to shared terrace and valley views.",
      es: "Cama queen con acceso a terraza compartida y vistas al valle.",
    },
    capacity: "2",
  },
  {
    id: "bunks",
    folder: "bunks",
    category: "rooms",
    icon: "👨‍👩‍👧‍👦",
    label: { en: "Family / Group Room", es: "Habitación Familiar / Grupal" },
    desc: {
      en: "Bunk beds perfect for families, kids and groups. Fits up to 4–5 guests.",
      es: "Literas ideales para familias, niños y grupos. Capacidad para 4–5 personas.",
    },
    capacity: "4–5",
    badge: { en: "Ideal for kids", es: "Ideal para niños" },
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

let _cache: SpacesConfig | null = null;

export async function getSpacesConfig(): Promise<SpacesConfig> {
  if (_cache) return _cache;
  const file = path.join(process.cwd(), "public", "spaces.json");
  const raw = await fs.readFile(file, "utf-8");
  _cache = JSON.parse(raw) as SpacesConfig;
  return _cache;
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
