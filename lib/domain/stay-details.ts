import { z } from "zod";

// Quick stay details (SD-1129). Pure. The name is the only field that matters (every message starts with it); everything else
// is optional and must be fast to fill. The database enforces the same bounds (save_stay_details and the table checks).

/** Special requests as one-tap chips. The keys are stored; the labels are what the owner sees. */
export const STAY_REQUESTS = {
  crib: "Cuna",
  extra_bed: "Cama extra",
  early_checkin: "Llegada temprano",
  late_checkout: "Salida tarde",
  pet: "Mascota",
  celebration: "Celebración",
  transfer: "Traslado",
  allergy: "Alergias",
  accessibility: "Accesibilidad",
} as const;
export type StayRequest = keyof typeof STAY_REQUESTS;
export const stayRequestKeys = Object.keys(STAY_REQUESTS) as StayRequest[];

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2064\u2066-\u206f\ufeff]/;
const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

/** The stay a form refers to: a web/manual booking, or an iCal reservation (feed + hashed uid). Exactly one. */
export const stayKeySchema = z.union([
  z.object({ bookingId: z.uuid(), feedId: z.undefined().optional(), externalUid: z.undefined().optional() }).transform((k) => ({ kind: "booking" as const, bookingId: k.bookingId })),
  z.object({ bookingId: z.undefined().optional(), feedId: z.uuid(), externalUid: z.string().regex(/^[a-f0-9]{64}$/) }).transform((k) => ({ kind: "ical" as const, feedId: k.feedId, externalUid: k.externalUid })),
]);
export type StayKey = z.output<typeof stayKeySchema>;

export const stayDetailsSchema = z.object({
  name: z.preprocess(blankToNull, z.string().trim().max(200).refine((v) => !CONTROL.test(v), "Sin caracteres de control.").nullable()),
  phone: z.preprocess(blankToNull, z.string().trim().min(5).max(30).regex(/^[0-9+() -]+$/, "Solo números, espacios, +, paréntesis o guiones.").nullable()),
  lang: z.enum(["es", "en"]),
  party: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().int().min(1).max(60).nullable()),
  arrival: z.preprocess(blankToNull, z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Usa el formato HH:MM.").nullable()),
  requests: z.array(z.enum(stayRequestKeys)).max(12).transform((r) => [...new Set(r)]),
  note: z.preprocess(blankToNull, z.string().trim().max(500).refine((v) => !CONTROL.test(v.replace(/[\n\r\t]/g, " ")), "Sin caracteres de control.").nullable()),
  remindOn: z.preprocess(blankToNull, z.iso.date().nullable()),
});
export type StayDetailsInput = z.output<typeof stayDetailsSchema>;

export type StayDetails = StayDetailsInput & { refCode: string | null; phoneLast4: string | null };

export const EMPTY_STAY: StayDetails = { name: null, phone: null, lang: "es", party: null, arrival: null, requests: [], note: null, remindOn: null, refCode: null, phoneLast4: null };

/** Where Airbnb shows the reservation; null without a valid code. The code is validated again here because it ends up in a link. */
export function airbnbReservationUrl(refCode: string | null): string | null {
  return refCode && /^[A-Z0-9]{6,20}$/.test(refCode) ? `https://www.airbnb.com/hosting/reservations/details/${refCode}` : null;
}

/** The first name of "Ana María Pérez" is what every message greets with; null when there is no name yet. */
export function firstName(name: string | null): string | null {
  const first = name?.replace(/\s+/g, " ").trim().split(" ")[0];
  return first ? first : null;
}

/** "Hola Ana" or just "Hola" while the name is still unknown: messages never block on a missing name. */
export function greeting(name: string | null, lang: "es" | "en"): string {
  const hello = lang === "es" ? "Hola" : "Hi";
  const first = firstName(name);
  return first ? `${hello} ${first}` : hello;
}

export type StayReminder = { name: string | null; requests: StayRequest[]; note: string | null; remindOn: string };

/** One line for the owner: "Ana · Cuna, Salida tarde · Llegan de Cusco". */
export function reminderSummary(r: Pick<StayReminder, "name" | "requests" | "note">): string {
  return [firstName(r.name) ?? "Sin nombre", r.requests.map((k) => STAY_REQUESTS[k]).join(", "), r.note?.replace(/\s+/g, " ").slice(0, 80)].filter(Boolean).join(" · ");
}
