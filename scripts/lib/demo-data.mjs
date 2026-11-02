// Fictional data for the shared demo installation (SD-1007, ADR 0010). Pure: no I/O. Nothing here comes from a
// real client or from Saywa Lodges. Fixed ids make the nightly reset deterministic and let the reset script
// recognise "its" organization; every row hangs from DEMO_ORG_ID, so deleting that organization removes it all.

export const DEMO_ORG_ID = "de000000-0000-4000-8000-000000000001";
export const DEMO_PROPERTY_ID = "de000000-0000-4000-8000-000000000002";
const UNIT_SUITE = "de000000-0000-4000-8000-000000000011";
const UNIT_HOUSE = "de000000-0000-4000-8000-000000000012";
const SEASON_HIGH = "de000000-0000-4000-8000-000000000021";

// Public on purpose: the sales site shows these credentials. The role is `staff`, never `owner`.
export const DEMO_STAFF_EMAIL = "demo-staff@example.com";
export const DEMO_STAFF_PASSWORD = "demo-saywa-2026";

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);

/** @param {Date} today  injected so the seasons always cover the coming months */
export function buildDemoData(today, { rootDomain } = {}) {
  const org_id = DEMO_ORG_ID;
  const property_id = DEMO_PROPERTY_ID;
  const base = { org_id, property_id };
  return {
    organization: { id: org_id, name: "Casa Demo Valle" },
    property: {
      id: property_id,
      org_id,
      slug: "demo",
      subdomain: "demo",
      name: "Casa Demo Valle",
      custom_domain: rootDomain ?? null,
      whatsapp_number: "51900000000",
      whatsapp_message_es: "Hola, quiero reservar en Casa Demo Valle.",
      whatsapp_message_en: "Hi, I would like to book Casa Demo Valle.",
      email: "demo@example.com",
      currency: "PEN",
      address_locality: "Valle Sagrado",
      address_region: "Cusco",
      address_country: "PE",
      meta_title_es: "Casa Demo Valle · Sitio de demostración",
      meta_title_en: "Casa Demo Valle · Demo site",
      meta_description_es: "Alojamiento ficticio para probar el sistema de reservas directas. Los datos se reinician cada noche.",
      meta_description_en: "Fictional lodging to try the direct-booking system. Data resets every night.",
      published: true,
    },
    units: [
      { id: UNIT_SUITE, ...base, name: "Suite Andina", kind: "room", max_guests: 2, included_guests: 2 },
      { id: UNIT_HOUSE, ...base, name: "Casa completa", kind: "entire_place", max_guests: 6, included_guests: 4 },
    ],
    // One high season, from today for 120 days (priority above the base rate). Seasons must not overlap per priority.
    seasons: [{ id: SEASON_HIGH, ...base, name: "Temporada alta (demo)", start_date: iso(today), end_date: iso(addDays(today, 120)), priority: 1 }],
    unit_rates: [
      { ...base, unit_id: UNIT_SUITE, season_id: null, nightly_cents: 18000, weekend_nightly_cents: 21000, extra_guest_cents: 4000, min_nights: 1 },
      { ...base, unit_id: UNIT_SUITE, season_id: SEASON_HIGH, nightly_cents: 24000, weekend_nightly_cents: 28000, extra_guest_cents: 4000, min_nights: 2 },
      { ...base, unit_id: UNIT_HOUSE, season_id: null, nightly_cents: 52000, weekend_nightly_cents: 60000, extra_guest_cents: 6000, min_nights: 2 },
      { ...base, unit_id: UNIT_HOUSE, season_id: SEASON_HIGH, nightly_cents: 70000, weekend_nightly_cents: 80000, extra_guest_cents: 6000, min_nights: 2 },
    ],
    fees: [
      { ...base, unit_id: UNIT_SUITE, name: "Limpieza", kind: "per_stay", amount_cents: 4000 },
      { ...base, unit_id: UNIT_HOUSE, name: "Limpieza", kind: "per_stay", amount_cents: 10000 },
    ],
    spaces: [
      { ...base, key: "garden", category: "outdoor", icon: "🌿", capacity: null, label_es: "Jardín", label_en: "Garden", desc_es: "Jardín de ejemplo.", desc_en: "Sample garden.", sort_order: 0 },
      { ...base, key: "suite", category: "rooms", icon: "🛏️", capacity: "2", label_es: "Suite Andina", label_en: "Andean Suite", desc_es: "Habitación de ejemplo.", desc_en: "Sample room.", sort_order: 1 },
    ],
    amenities: [
      { ...base, title_es: "Wi-Fi", title_en: "Wi-Fi", desc_es: "Conexión de ejemplo.", desc_en: "Sample connection.", sort_order: 0 },
      { ...base, title_es: "Desayuno", title_en: "Breakfast", desc_es: "Opcional (ficticio).", desc_en: "Optional (fictional).", sort_order: 1 },
    ],
    distances: [
      { ...base, place_es: "Plaza del pueblo", place_en: "Town square", time_es: "5 min", time_en: "5 min", sort_order: 0 },
      { ...base, place_es: "Estación de tren", place_en: "Train station", time_es: "15 min", time_en: "15 min", sort_order: 1 },
    ],
    membership: { org_id, role: "staff" },
  };
}

/** Insert order that respects the composite foreign keys. */
export const INSERT_ORDER = ["organization", "property", "units", "seasons", "unit_rates", "fees", "spaces", "amenities", "distances"];
export const TABLE_OF = {
  organization: "organizations", property: "properties", units: "units", seasons: "seasons", unit_rates: "unit_rates",
  fees: "fees", spaces: "spaces", amenities: "amenities", distances: "distances",
};
