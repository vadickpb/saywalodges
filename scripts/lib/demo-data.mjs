// Fictional data for the shared demo installation (SD-1007/SD-1104, ADR 0010). Pure: no I/O. Nothing here comes from a
// real client or from Saywa Lodges. Fixed ids make the nightly reset deterministic and let the reset script
// recognise "its" organization; every row hangs from DEMO_ORG_ID, so deleting that organization removes it all.

export { DEMO_GUIDE_PASSWORD, DEMO_GUIDE_TOKEN, DEMO_STAFF_EMAIL, DEMO_STAFF_PASSWORD } from "../../lib/demo-credentials.js";

export const DEMO_ORG_ID = "de000000-0000-4000-8000-000000000001";
export const DEMO_PROPERTY_ID = "de000000-0000-4000-8000-000000000002";
const UNIT_SUITE = "de000000-0000-4000-8000-000000000011";
const UNIT_HOUSE = "de000000-0000-4000-8000-000000000012";
const SEASON_HIGH = "de000000-0000-4000-8000-000000000021";
const ICAL_SUITE = "de000000-0000-4000-8000-000000000031";
const ICAL_HOUSE = "de000000-0000-4000-8000-000000000032";
const GUIDE_ID = "de000000-0000-4000-8000-000000000041";
const GUIDE_LINK_ID = "de000000-0000-4000-8000-000000000044";
const GUIDE_TOKEN_HASH = "15b8b53b56fa0f88d7b6a36b92b2778100f57fcdadb8788d68416c7e7b546c5b";
// bcrypt("demo-guide-2026", cost 10). The plaintext is intentionally public,
// but the database still stores the same one-way representation as real links.
const GUIDE_PASSWORD_HASH = "$2a$10$4g3KdJfrHUnTNK6SjquSEulkS1mfVkA68RU5vTrFnvTI9B9KmXqra";

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);
const monthDate = (today, offset, day) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, day));
const fixedId = (group, index) => `de${group.toString().padStart(6, "0")}-0000-4000-8000-${index.toString().padStart(12, "0")}`;

const GUIDE = {
  title: "Guía de Casa Demo Valle",
  sections: [
    {
      id: "de000000-0000-4000-8000-000000000042",
      title: "Llegada y acceso",
      text: "Contenido ficticio para conocer cómo se comparte una guía privada con huéspedes.",
      steps: ["Confirma tu hora de llegada.", "Usa el código de ejemplo enviado con tu reserva."],
      images: [],
      visible: true,
    },
    {
      id: "de000000-0000-4000-8000-000000000043",
      title: "Durante la estadía",
      text: "Cuida los espacios comunes y respeta el descanso desde las 22:00.",
      steps: [],
      images: [],
      visible: true,
    },
  ],
};

/** @param {Date} today  injected so the seasons always cover the coming months */
export function buildDemoData(today, { rootDomain } = {}) {
  const org_id = DEMO_ORG_ID;
  const property_id = DEMO_PROPERTY_ID;
  const base = { org_id, property_id };
  const resetDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const stays = Array.from({ length: 12 }, (_, index) => {
    const offset = index - 6;
    const unit_id = index % 2 === 0 ? UNIT_SUITE : UNIT_HOUSE;
    const checkIn = monthDate(today, offset, 6 + (index % 3));
    const nights = unit_id === UNIT_SUITE ? 2 : 3;
    const total_cents = unit_id === UNIT_SUITE ? 52000 + index * 1000 : 118000 + index * 1500;
    const guests = unit_id === UNIT_SUITE ? 2 : 4;
    return {
      index,
      unit_id,
      check_in: iso(checkIn),
      check_out: iso(addDays(checkIn, nights)),
      total_cents,
      deposit_cents: Math.round(total_cents * 0.5),
      guests,
    };
  });
  const guests = stays.map((stay) => ({
    id: fixedId(100, stay.index + 1),
    org_id,
    name: `Huésped Ficticio ${String(stay.index + 1).padStart(2, "0")}`,
    email: `guest${String(stay.index + 1).padStart(2, "0")}@example.com`,
    // Null is safer than an invented, dialable-looking number: no real person
    // can ever receive a call or message caused by exploring the public demo.
    phone: null,
  }));
  const quotes = stays.map((stay) => {
    const naturalConfirmation = addDays(new Date(`${stay.check_in}T12:00:00.000Z`), -30);
    const confirmedAt = naturalConfirmation > resetDay ? resetDay : naturalConfirmation;
    const createdAt = addDays(confirmedAt, -2);
    return {
      id: fixedId(200, stay.index + 1),
      ...base,
      unit_id: stay.unit_id,
      token: `demo-quote-${String(stay.index + 1).padStart(2, "0")}-0000000000000000000000000000`,
      check_in: stay.check_in,
      check_out: stay.check_out,
      guests: stay.guests,
      currency: "PEN",
      total_cents: stay.total_cents,
      deposit_cents: stay.deposit_cents,
      breakdown: { demo: true, nights: stay.unit_id === UNIT_SUITE ? 2 : 3 },
      expires_at: addDays(confirmedAt, 5).toISOString(),
      created_at: createdAt.toISOString(),
    };
  });
  const bookings = stays.map((stay) => {
    const naturalConfirmation = addDays(new Date(`${stay.check_in}T12:00:00.000Z`), -30);
    const confirmedAt = naturalConfirmation > resetDay ? resetDay : naturalConfirmation;
    return {
      id: fixedId(300, stay.index + 1),
      ...base,
      unit_id: stay.unit_id,
      guest_id: guests[stay.index].id,
      quote_id: quotes[stay.index].id,
      check_in: stay.check_in,
      check_out: stay.check_out,
      guests: stay.guests,
      currency: "PEN",
      total_cents: stay.total_cents,
      deposit_cents: stay.deposit_cents,
      status: "confirmed",
      expires_at: null,
      confirmed_at: confirmedAt.toISOString(),
      created_at: confirmedAt.toISOString(),
      public_token: `${(stay.index + 1).toString(16).padStart(64, "0")}`,
      email_lang: stay.index % 3 === 0 ? "en" : "es",
    };
  });
  const payments = stays.map((stay) => ({
    id: fixedId(350, stay.index + 1),
    org_id,
    booking_id: bookings[stay.index].id,
    amount_cents: stay.total_cents,
    currency: "PEN",
    method: "bank_transfer",
    status: "approved",
    reference: `DEMO-${String(stay.index + 1).padStart(4, "0")}`,
    voucher_path: null,
    reject_reason: null,
    reviewed_at: bookings[stay.index].confirmed_at,
    reviewed_by: null,
    created_at: bookings[stay.index].confirmed_at,
  }));
  const bookingBlocks = stays.map((stay) => ({
    id: fixedId(400, stay.index + 1),
    ...base,
    unit_id: stay.unit_id,
    period: `[${stay.check_in},${stay.check_out})`,
    source: "booking",
    booking_id: bookings[stay.index].id,
    feed_id: null,
    external_uid: null,
    expires_at: null,
    note: null,
  }));
  const icalSpecs = [
    { offset: -5, day: 19, unit_id: UNIT_SUITE, feed_id: ICAL_SUITE },
    { offset: -2, day: 20, unit_id: UNIT_HOUSE, feed_id: ICAL_HOUSE },
    { offset: 2, day: 18, unit_id: UNIT_SUITE, feed_id: ICAL_SUITE },
    { offset: 4, day: 21, unit_id: UNIT_HOUSE, feed_id: ICAL_HOUSE },
  ];
  const icalBlocks = icalSpecs.map((spec, index) => {
    const start = monthDate(today, spec.offset, spec.day);
    return {
      id: fixedId(410, index + 1),
      ...base,
      unit_id: spec.unit_id,
      period: `[${iso(start)},${iso(addDays(start, 3))})`,
      source: "ical",
      booking_id: null,
      feed_id: spec.feed_id,
      external_uid: `demo-airbnb-${String(index + 1).padStart(2, "0")}@example.com`,
      expires_at: null,
      note: null,
    };
  });
  const finance_entries = stays.flatMap((stay) => {
    const incomeId = fixedId(500, stay.index * 4 + 1);
    const channel = stay.index % 2 === 0 ? "direct" : "airbnb";
    const cleaning = stay.unit_id === UNIT_SUITE ? 6500 : 12000;
    const commission = channel === "airbnb" ? Math.round(stay.total_cents * 0.15) : 0;
    const occurredOn = iso(new Date(bookings[stay.index].confirmed_at));
    const entries = [
      {
        id: incomeId,
        org_id,
        kind: "income",
        category_key: "rental",
        occurred_on: occurredOn,
        amount_cents: stay.total_cents,
        currency: "PEN",
        unit_id: stay.unit_id,
        payment_method: channel === "airbnb" ? "platform" : "bank_transfer",
        counterparty: guests[stay.index].name,
        note: channel === "airbnb" ? "Reserva ficticia de Airbnb (importe bruto)." : "Reserva directa ficticia.",
        stay_start: stay.check_in,
        stay_end: stay.check_out,
        channel,
        guests: stay.guests,
        related_entry_id: null,
        source: "manual",
      },
    ];
    if (stay.check_out <= iso(resetDay)) {
      entries.push({
        id: fixedId(500, stay.index * 4 + 2),
        org_id,
        kind: "expense",
        category_key: "cleaning",
        occurred_on: stay.check_out,
        amount_cents: cleaning,
        currency: "PEN",
        unit_id: stay.unit_id,
        payment_method: "cash",
        counterparty: "Limpieza Demo",
        note: "Limpieza ficticia después de la estadía.",
        stay_start: null,
        stay_end: null,
        channel: null,
        guests: null,
        related_entry_id: incomeId,
        source: "manual",
      });
    }
    if (stay.index < 6) {
      entries.push({
        id: fixedId(500, stay.index * 4 + 3),
        org_id,
        kind: "expense",
        category_key: "electricity",
        occurred_on: iso(monthDate(today, stay.index - 6, 25)),
        amount_cents: 8500 + (stay.index % 3) * 500,
        currency: "PEN",
        unit_id: stay.unit_id,
        payment_method: "bank_transfer",
        counterparty: "Servicios Demo",
        note: "Servicio ficticio del mes.",
        stay_start: null,
        stay_end: null,
        channel: null,
        guests: null,
        related_entry_id: incomeId,
        source: "manual",
      });
    }
    if (commission > 0) {
      entries.push({
        id: fixedId(500, stay.index * 4 + 4),
        org_id,
        kind: "expense",
        category_key: "platform_commission",
        occurred_on: occurredOn,
        amount_cents: commission,
        currency: "PEN",
        unit_id: stay.unit_id,
        payment_method: "platform",
        counterparty: "Airbnb Demo",
        note: "Comisión ficticia de plataforma (15 %).",
        stay_start: null,
        stay_end: null,
        channel: null,
        guests: null,
        related_entry_id: incomeId,
        source: "manual",
      });
    }
    return entries;
  });
  return {
    organization: { id: org_id, name: "Casa Demo Valle" },
    property: {
      id: property_id,
      org_id,
      slug: "demo",
      subdomain: "demo",
      name: "Casa Demo Valle",
      custom_domain: rootDomain ?? null,
      site_url: rootDomain ? `https://${rootDomain}` : "",
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
      { id: fixedId(20, 1), ...base, unit_id: UNIT_SUITE, season_id: null, nightly_cents: 18000, weekend_nightly_cents: 21000, extra_guest_cents: 4000, min_nights: 1 },
      { id: fixedId(20, 2), ...base, unit_id: UNIT_SUITE, season_id: SEASON_HIGH, nightly_cents: 24000, weekend_nightly_cents: 28000, extra_guest_cents: 4000, min_nights: 2 },
      { id: fixedId(20, 3), ...base, unit_id: UNIT_HOUSE, season_id: null, nightly_cents: 52000, weekend_nightly_cents: 60000, extra_guest_cents: 6000, min_nights: 2 },
      { id: fixedId(20, 4), ...base, unit_id: UNIT_HOUSE, season_id: SEASON_HIGH, nightly_cents: 70000, weekend_nightly_cents: 80000, extra_guest_cents: 6000, min_nights: 2 },
    ],
    fees: [
      { id: fixedId(21, 1), ...base, unit_id: UNIT_SUITE, name: "Limpieza", kind: "per_stay", amount_cents: 4000 },
      { id: fixedId(21, 2), ...base, unit_id: UNIT_HOUSE, name: "Limpieza", kind: "per_stay", amount_cents: 10000 },
    ],
    spaces: [
      { id: fixedId(22, 1), ...base, key: "garden", category: "outdoor", icon: "🌿", capacity: null, label_es: "Jardín", label_en: "Garden", desc_es: "Jardín de ejemplo.", desc_en: "Sample garden.", sort_order: 0 },
      { id: fixedId(22, 2), ...base, key: "suite", category: "rooms", icon: "🛏️", capacity: "2", label_es: "Suite Andina", label_en: "Andean Suite", desc_es: "Habitación de ejemplo.", desc_en: "Sample room.", sort_order: 1 },
    ],
    amenities: [
      { id: fixedId(23, 1), ...base, title_es: "Wi-Fi", title_en: "Wi-Fi", desc_es: "Conexión de ejemplo.", desc_en: "Sample connection.", sort_order: 0 },
      { id: fixedId(23, 2), ...base, title_es: "Desayuno", title_en: "Breakfast", desc_es: "Opcional (ficticio).", desc_en: "Optional (fictional).", sort_order: 1 },
    ],
    distances: [
      { id: fixedId(24, 1), ...base, place_es: "Plaza del pueblo", place_en: "Town square", time_es: "5 min", time_en: "5 min", sort_order: 0 },
      { id: fixedId(24, 2), ...base, place_es: "Estación de tren", place_en: "Train station", time_es: "15 min", time_en: "15 min", sort_order: 1 },
    ],
    guests,
    quotes,
    bookings,
    payments,
    ical_feeds: [
      { id: ICAL_SUITE, org_id, unit_id: UNIT_SUITE, channel: "airbnb", import_url: "https://calendar.example.com/demo-suite.ics", export_token: "a".repeat(64), last_synced_at: today.toISOString() },
      { id: ICAL_HOUSE, org_id, unit_id: UNIT_HOUSE, channel: "airbnb", import_url: "https://calendar.example.com/demo-house.ics", export_token: "b".repeat(64), last_synced_at: today.toISOString() },
    ],
    calendar_blocks: [...bookingBlocks, ...icalBlocks],
    finance_unit_settings: [
      { org_id, unit_id: UNIT_SUITE, cleaning_cost_cents: 6500 },
      { org_id, unit_id: UNIT_HOUSE, cleaning_cost_cents: 12000 },
    ],
    finance_entries,
    house_guides: [{ id: GUIDE_ID, org_id, draft: GUIDE, published: GUIDE, version: 1 }],
    house_guide_links: [{
      id: GUIDE_LINK_ID,
      org_id,
      label: "Acceso público de demostración",
      token_hash: GUIDE_TOKEN_HASH,
      password_hash: GUIDE_PASSWORD_HASH,
      expires_at: addDays(resetDay, 365).toISOString(),
      revoked_at: null,
    }],
    membership: { org_id, role: "staff" },
  };
}

// Mirrors the CHECK constraints of public.properties (migration 20261016230028). The reset script validates BEFORE it
// deletes anything: a bad value (say a DEMO_ROOT_DOMAIN with capitals or a port) must abort while the demo is still intact,
// not after the organization is gone (that would leave the demo empty every night).
const SUBDOMAIN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const CUSTOM_DOMAIN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
const RESERVED = ["app", "www", "api", "admin", "dashboard", "mail", "ftp", "assets", "static", "cdn", "support", "help", "blog", "status", "docs"];
export const PRIVATE_BUCKETS = ["property-photos", "finance-receipts", "payment-vouchers"];

/** @returns {string[]} human-readable problems; empty = valid */
export function validateDemoData(data) {
  const problems = [];
  const p = data.property;
  if (!SUBDOMAIN.test(p.subdomain) || RESERVED.includes(p.subdomain)) problems.push("property.subdomain is invalid or reserved");
  if (p.custom_domain !== null && !CUSTOM_DOMAIN.test(p.custom_domain)) {
    problems.push("DEMO_ROOT_DOMAIN must be a lowercase bare domain such as demo.example.org (no scheme, port or trailing dot)");
  }
  return problems;
}

/** Insert order that respects the composite foreign keys. */
export const INSERT_ORDER = [
  "organization", "property", "units", "seasons", "unit_rates", "fees", "spaces", "amenities", "distances",
  "guests", "quotes", "bookings", "payments", "ical_feeds", "calendar_blocks", "finance_unit_settings", "finance_entries",
  "house_guides", "house_guide_links",
];
export const TABLE_OF = {
  organization: "organizations", property: "properties", units: "units", seasons: "seasons", unit_rates: "unit_rates",
  fees: "fees", spaces: "spaces", amenities: "amenities", distances: "distances", guests: "guests", quotes: "quotes",
  bookings: "bookings", payments: "payments", ical_feeds: "ical_feeds", calendar_blocks: "calendar_blocks",
  finance_unit_settings: "finance_unit_settings", finance_entries: "finance_entries", house_guides: "house_guides",
  house_guide_links: "house_guide_links",
};
