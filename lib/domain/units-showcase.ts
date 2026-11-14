import type { Locale } from "@/dictionaries";
import type { ShowcaseType } from "./units";

type UnitFacts = {
  maxGuests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  bedDetails?: string;
};

const TYPE_LABELS: Record<Locale, Record<ShowcaseType, string>> = {
  es: { house: "Casa", apartment: "Departamento", villa: "Villa completa", room: "Habitación" },
  en: { house: "House", apartment: "Apartment", villa: "Entire villa", room: "Room" },
};

export function showcaseSectionTitle(types: readonly ShowcaseType[], lang: Locale): string {
  if (types.length > 0 && types.every((type) => type === "house")) return lang === "es" ? "Casas disponibles" : "Available houses";
  if (types.length > 0 && types.every((type) => type === "apartment")) return lang === "es" ? "Departamentos disponibles" : "Available apartments";
  return lang === "es" ? "Alojamientos disponibles" : "Available stays";
}

export function showcaseTypeLabel(type: ShowcaseType, lang: Locale): string {
  return TYPE_LABELS[lang][type];
}

function plural(count: number, singular: string, multiple: string): string {
  return `${count} ${count === 1 ? singular : multiple}`;
}

export function showcaseFacts(unit: UnitFacts, lang: Locale): string[] {
  if (lang === "es") {
    return [
      plural(unit.maxGuests, "huésped", "huéspedes"),
      plural(unit.bedrooms, "dormitorio", "dormitorios"),
      `${plural(unit.beds, "cama", "camas")}${unit.bedDetails ? ` · ${unit.bedDetails}` : ""}`,
      plural(unit.bathrooms, "baño", "baños"),
    ];
  }
  return [
    plural(unit.maxGuests, "guest", "guests"),
    plural(unit.bedrooms, "bedroom", "bedrooms"),
    `${plural(unit.beds, "bed", "beds")}${unit.bedDetails ? ` · ${unit.bedDetails}` : ""}`,
    plural(unit.bathrooms, "bathroom", "bathrooms"),
  ];
}
