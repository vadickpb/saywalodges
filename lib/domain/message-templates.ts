import { z } from "zod";
import { normalizeWhatsappPhone } from "./whatsapp-templates";
import { firstName, STAY_REQUESTS, type StayRequest } from "./stay-details";

// The owner's message library (SD-1130). Pure. A message is text with {variables}; it is rendered for ONE stay and then sent by
// the owner (WhatsApp link, copy, e-mail). Nothing here sends anything. The database stores only what the owner customized: without
// a row, the built-in text below is used, so a new installation works at once.

export type Lang = "es" | "en";
export type Anchor = "check_in" | "check_out";

export const MESSAGE_KEYS = ["confirmation", "before_arrival", "arrival_day", "welcome", "house_rules", "before_departure", "farewell"] as const;
export const CUSTOM_KEYS = ["custom_1", "custom_2", "custom_3", "custom_4", "custom_5", "custom_6"] as const;
export type MessageKey = (typeof MESSAGE_KEYS)[number] | (typeof CUSTOM_KEYS)[number];
export const isMessageKey = (v: string): v is MessageKey => (MESSAGE_KEYS as readonly string[]).includes(v) || (CUSTOM_KEYS as readonly string[]).includes(v);

/** Every {variable} a message may use, with what it means (shown as tap-to-insert chips in the editor). */
export const VARIABLES = {
  saludo: "Saludo con el primer nombre («Hola Ana»); sin nombre, solo «Hola»",
  nombre: "Primer nombre del huésped",
  villa: "Nombre del alojamiento",
  llegada: "Fecha de llegada",
  salida: "Fecha de salida",
  noches: "Número de noches",
  huespedes: "Número de huéspedes",
  hora_checkin: "Hora de check-in (Ajustes → Mensajes)",
  hora_checkout: "Hora de check-out (Ajustes → Mensajes)",
  wifi_nombre: "Nombre de la red WiFi",
  wifi_clave: "Clave del WiFi (solo se completa cerca de la llegada)",
  codigo_puerta: "Código de la puerta (solo se completa cerca de la llegada)",
  ubicacion: "Enlace de ubicación",
  contacto: "Tu teléfono de contacto",
  reglas: "Reglas de la casa (Ajustes → Mensajes)",
  pedidos: "Pedidos especiales anotados de esa estadía",
} as const;
export type VariableName = keyof typeof VARIABLES;
export const variableNames = Object.keys(VARIABLES) as VariableName[];
/** Values that must not travel weeks before the stay. */
export const SENSITIVE: readonly VariableName[] = ["wifi_clave", "codigo_puerta"];
/** Sensitive values are filled in from this many days before check-in until check-out. */
export const SENSITIVE_DAYS_BEFORE = 2;

export type Template = { key: MessageKey; title: string; bodyEs: string; bodyEn: string; anchor: Anchor | null; offsetDays: number | null; custom: boolean };

/** The built-in messages. `offsetDays` < 0 is before the anchor, > 0 after it. */
export const DEFAULT_TEMPLATES: Template[] = [
  {
    key: "confirmation", title: "Confirmación de reserva", anchor: null, offsetDays: null, custom: false,
    bodyEs: "{saludo} 👋 Tu reserva en {villa} está confirmada.\nLlegada: {llegada} · Salida: {salida} ({noches} noches)\n{huespedes} huéspedes.\nCualquier duda, escríbeme por aquí.",
    bodyEn: "{saludo} 👋 Your booking at {villa} is confirmed.\nCheck-in: {llegada} · Check-out: {salida} ({noches} nights)\n{huespedes} guests.\nIf you have any questions, message me here.",
  },
  {
    key: "before_arrival", title: "Antes de tu llegada", anchor: "check_in", offsetDays: -3, custom: false,
    bodyEs: "{saludo}, ¡falta poco para tu llegada a {villa}!\nCheck-in desde las {hora_checkin}.\nUbicación: {ubicacion}\nPedidos que tenemos anotados: {pedidos}\n¿A qué hora calculas llegar?",
    bodyEn: "{saludo}, your arrival at {villa} is coming up!\nCheck-in from {hora_checkin}.\nLocation: {ubicacion}\nRequests we have noted: {pedidos}\nWhat time do you expect to arrive?",
  },
  {
    key: "arrival_day", title: "Día de llegada", anchor: "check_in", offsetDays: 0, custom: false,
    bodyEs: "{saludo} 😊 Hoy es tu llegada a {villa}. Te esperamos desde las {hora_checkin}.\nAvísame cuando estés cerca y te recibimos.",
    bodyEn: "{saludo} 😊 Today is your arrival at {villa}. We expect you from {hora_checkin}.\nLet me know when you are close and we will welcome you.",
  },
  {
    key: "welcome", title: "Bienvenida", anchor: "check_in", offsetDays: 0, custom: false,
    bodyEs: "{saludo}, ¡bienvenido a {villa}! 🏡\nWiFi: {wifi_nombre}\nClave: {wifi_clave}\nCódigo de la puerta: {codigo_puerta}\nSi necesitas algo, escríbeme.",
    bodyEn: "{saludo}, welcome to {villa}! 🏡\nWiFi: {wifi_nombre}\nPassword: {wifi_clave}\nDoor code: {codigo_puerta}\nIf you need anything, message me.",
  },
  {
    key: "house_rules", title: "Reglas de la casa", anchor: "check_in", offsetDays: 0, custom: false,
    bodyEs: "{saludo}, estas son las reglas de la casa para que todos disfruten:\n{reglas}\n¡Gracias por cuidarla!",
    bodyEn: "{saludo}, here are the house rules so everyone can enjoy their stay:\n{reglas}\nThank you for taking care of it!",
  },
  {
    key: "before_departure", title: "Antes de la salida", anchor: "check_out", offsetDays: -1, custom: false,
    bodyEs: "{saludo}, mañana es tu salida de {villa}. El check-out es a las {hora_checkout}.\nSi necesitas salir más tarde, avísame y vemos si es posible.",
    bodyEn: "{saludo}, tomorrow is your check-out from {villa}. Check-out is at {hora_checkout}.\nIf you need a later departure, let me know and we will see if it is possible.",
  },
  {
    key: "farewell", title: "Despedida", anchor: "check_out", offsetDays: 0, custom: false,
    bodyEs: "{saludo}, gracias por alojarte en {villa} 🙏 Esperamos que hayas disfrutado tu estadía. Si quieres, cuéntanos cómo te fue; nos ayuda mucho. ¡Hasta la próxima!",
    bodyEn: "{saludo}, thank you for staying at {villa} 🙏 We hope you enjoyed your stay. If you like, tell us how it went; it helps us a lot. See you next time!",
  },
];

// ─── Editing ────────────────────────────────────────────────────────────────

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff]/;
// Any {word}: a typo or a different case ({Nombre}) is reported as unknown instead of being sent as it is.
const VARIABLE_TOKEN = /\{([^{}\s]{1,40})\}/g;

/** Variables used in a text that are not in the list (a typo like {nombrre} would otherwise be sent as is). */
export function unknownVariables(text: string): string[] {
  const unknown = new Set<string>();
  for (const match of text.matchAll(VARIABLE_TOKEN)) if (!(match[1] in VARIABLES)) unknown.add(match[1]);
  return [...unknown];
}

const bodySchema = z.string().trim().min(1, "Escribe el mensaje.").max(2000, "Máximo 2000 caracteres.")
  .refine((v) => !CONTROL.test(v), "Sin caracteres de control.")
  .superRefine((v, ctx) => {
    const unknown = unknownVariables(v);
    if (unknown.length > 0) ctx.addIssue({ code: "custom", message: `Variable desconocida: ${unknown.map((u) => `{${u}}`).join(", ")}.` });
  });

export const templateInputSchema = z.object({
  key: z.string().refine(isMessageKey, "Mensaje no válido."),
  title: z.string().trim().min(1, "Escribe un título.").max(80).refine((v) => !CONTROL.test(v), "Sin caracteres de control."),
  bodyEs: bodySchema,
  bodyEn: bodySchema,
  anchor: z.preprocess((v) => (v === "" ? null : v), z.enum(["check_in", "check_out"]).nullable()),
  offsetDays: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().int().min(-30).max(30).nullable()),
}).refine((t) => (t.anchor === null) === (t.offsetDays === null), { path: ["offsetDays"], message: "Elige a partir de cuándo y cuántos días." });
export type TemplateInput = z.output<typeof templateInputSchema>;

// A field the form leaves out, empty or blank means "not set".
const blank = (v: unknown) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v);
const nullableText = (max: number) => z.preprocess(blank, z.string().trim().max(max).refine((v) => !CONTROL.test(v), "Sin caracteres de control.").nullable());
const time = z.preprocess(blank, z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Usa el formato HH:MM.").nullable());
export const houseInfoSchema = z.object({
  checkinTime: time,
  checkoutTime: time,
  wifiName: nullableText(100),
  wifiPassword: nullableText(100),
  doorCode: nullableText(40),
  locationUrl: z.preprocess(blank, z.string().trim().max(500).regex(/^https:\/\/\S+$/, "Debe ser un enlace https://…").nullable()),
  contactPhone: z.preprocess(blank, z.string().trim().min(5).max(30).regex(/^[0-9+() -]+$/, "Solo números, espacios, +, paréntesis o guiones.").nullable()),
  rulesEs: nullableText(3000),
  rulesEn: nullableText(3000),
});
export type HouseInfo = z.output<typeof houseInfoSchema>;
export const EMPTY_HOUSE: HouseInfo = { checkinTime: null, checkoutTime: null, wifiName: null, wifiPassword: null, doorCode: null, locationUrl: null, contactPhone: null, rulesEs: null, rulesEn: null };

// ─── Rendering ──────────────────────────────────────────────────────────────

export type StayContext = {
  lang: Lang;
  name: string | null;
  unit: string;
  checkIn: string; // ISO date
  checkOut: string;
  guests: number | null;
  requests: StayRequest[];
  house: HouseInfo;
  /** Today in Lima (ISO date): sensitive values are filled in only close to the stay. */
  today: string;
  /** Sensitive values the server did not send (outside the window) but that exist: they read as "withheld", not as "missing". */
  secretsConfigured?: { wifi_clave: boolean; codigo_puerta: boolean };
};
/** True when `today` is inside [check-in − SENSITIVE_DAYS_BEFORE, check-out]: the only time the Wi-Fi password and door code are used. */
export function inSensitiveWindow(stay: { checkIn: string; checkOut: string }, today: string): boolean {
  return today >= addIsoDays(stay.checkIn, -SENSITIVE_DAYS_BEFORE) && today <= stay.checkOut;
}

/**
 * The house data as it may travel to the browser (SD-1130 review): the Wi-Fi password and the door code are NOT included. The server
 * sends them only together with a stay that is inside its window (see `inSensitiveWindow`), so "close to the arrival" is enforced by
 * what leaves the server, not just by the screen. `configured` tells the screen they exist, to say "se envía cerca de la llegada".
 */
export function splitSecrets(house: HouseInfo): { publicHouse: HouseInfo; secrets: Pick<HouseInfo, "wifiPassword" | "doorCode">; configured: { wifi_clave: boolean; codigo_puerta: boolean } } {
  return {
    publicHouse: { ...house, wifiPassword: null, doorCode: null },
    secrets: { wifiPassword: house.wifiPassword, doorCode: house.doorCode },
    configured: { wifi_clave: house.wifiPassword !== null, codigo_puerta: house.doorCode !== null },
  };
}

export type Rendered = { text: string; missing: VariableName[]; withheld: VariableName[] };

const REQUEST_LABELS_EN: Record<StayRequest, string> = {
  crib: "Crib", extra_bed: "Extra bed", early_checkin: "Early check-in", late_checkout: "Late check-out", pet: "Pet",
  celebration: "Celebration", transfer: "Transfer", allergy: "Allergies", accessibility: "Accessibility",
};
const day = (lang: Lang, iso: string) => new Intl.DateTimeFormat(lang === "es" ? "es-PE" : "en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const nightsBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
export const addIsoDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

const WITHHELD_TEXT: Record<Lang, string> = { es: "(te la envío cerca de tu llegada)", en: "(I will send it closer to your arrival)" };

function values(ctx: StayContext): Record<VariableName, string | null> {
  const { lang, house } = ctx;
  // The name comes from guests (checkout, Airbnb): no control or text-direction characters in a message.
  const first = firstName(ctx.name)?.replace(new RegExp(CONTROL.source, "g"), "") || null;
  const hello = lang === "es" ? "Hola" : "Hi";
  return {
    saludo: first ? `${hello} ${first}` : hello,
    nombre: first,
    villa: ctx.unit || null,
    llegada: day(lang, ctx.checkIn),
    salida: day(lang, ctx.checkOut),
    noches: String(nightsBetween(ctx.checkIn, ctx.checkOut)),
    huespedes: ctx.guests ? String(ctx.guests) : null,
    hora_checkin: house.checkinTime,
    hora_checkout: house.checkoutTime,
    wifi_nombre: house.wifiName,
    wifi_clave: house.wifiPassword,
    codigo_puerta: house.doorCode,
    ubicacion: house.locationUrl,
    contacto: house.contactPhone,
    reglas: lang === "es" ? house.rulesEs : house.rulesEn,
    pedidos: ctx.requests.length ? ctx.requests.map((r) => (lang === "es" ? STAY_REQUESTS[r] : REQUEST_LABELS_EN[r])).join(", ") : null,
  };
}

/**
 * Fills a message for one stay. A line that needs a value that does not exist (no Wi-Fi saved, no special requests) is dropped
 * whole, so the message never says "Clave: ". Keep optional data on its own line (the built-in messages do) so a missing guest
 * count never takes the dates with it. Sensitive values outside [check-in − 2 days, check-out] become a polite placeholder.
 * `missing` and `withheld` tell the owner what happened.
 */
export function renderMessage(body: string, ctx: StayContext): Rendered {
  const vals = values(ctx);
  const sensitiveOpen = inSensitiveWindow(ctx, ctx.today);
  const missing = new Set<VariableName>();
  const withheld = new Set<VariableName>();
  const lines: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    let drop = false;
    const filled = line.replace(VARIABLE_TOKEN, (token, name: string) => {
      if (!(name in VARIABLES)) return token; // validated on save; never invent a value
      const key = name as VariableName;
      const exists = Boolean(vals[key]) || Boolean(ctx.secretsConfigured?.[key as "wifi_clave" | "codigo_puerta"]);
      if (SENSITIVE.includes(key) && exists && !sensitiveOpen) { withheld.add(key); return WITHHELD_TEXT[ctx.lang]; }
      const value = vals[key];
      if (value === null || value === "") { missing.add(key); drop = true; return ""; }
      return value;
    });
    if (!drop) lines.push(filled);
  }
  // A dropped line can leave blank lines in a row.
  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text, missing: [...missing], withheld: [...withheld] };
}

/** When a message is due for a stay: its date and whether it is today, already past or still ahead. */
export function dueState(t: Pick<Template, "anchor" | "offsetDays">, stay: { checkIn: string; checkOut: string }, today: string): { date: string; state: "today" | "past" | "upcoming" } | null {
  if (!t.anchor || t.offsetDays === null) return null;
  const date = addIsoDays(t.anchor === "check_in" ? stay.checkIn : stay.checkOut, t.offsetDays);
  return { date, state: date === today ? "today" : date < today ? "past" : "upcoming" };
}

/** "Antes de la llegada: 3 días antes" etc. for the settings screen and the badge. */
export function dueLabel(t: Pick<Template, "anchor" | "offsetDays">): string {
  if (!t.anchor || t.offsetDays === null) return "Cuando tú quieras";
  const base = t.anchor === "check_in" ? "la llegada" : "la salida";
  if (t.offsetDays === 0) return t.anchor === "check_in" ? "El día de la llegada" : "El día de la salida";
  return t.offsetDays < 0 ? `${-t.offsetDays} ${t.offsetDays === -1 ? "día" : "días"} antes de ${base}` : `${t.offsetDays} ${t.offsetDays === 1 ? "día" : "días"} después de ${base}`;
}

/** Link that opens WhatsApp with the chat of the guest and the text ready to send. Null without a usable number. */
export function whatsappLink(phone: string | null, text: string): string | null {
  const digits = phone ? normalizeWhatsappPhone(phone) : null;
  return digits && text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}

/** Built-in text merged with what the owner customized, in display order (moments first, then the custom ones). */
export function effectiveTemplates(rows: { key: string; title: string; bodyEs: string; bodyEn: string; anchor: Anchor | null; offsetDays: number | null }[]): Template[] {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const moments = DEFAULT_TEMPLATES.map((d) => {
    const row = byKey.get(d.key);
    return row && isMessageKey(row.key) ? { key: d.key, title: row.title, bodyEs: row.bodyEs, bodyEn: row.bodyEn, anchor: row.anchor, offsetDays: row.offsetDays, custom: false } : d;
  });
  const custom = CUSTOM_KEYS.flatMap((key): Template[] => {
    const row = byKey.get(key);
    return row ? [{ key, title: row.title, bodyEs: row.bodyEs, bodyEn: row.bodyEn, anchor: row.anchor, offsetDays: row.offsetDays, custom: true }] : [];
  });
  return [...moments, ...custom];
}
