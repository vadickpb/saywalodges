import { z } from "zod";

// WhatsApp booking messages (SD-1009). Pure: no I/O. The four approved-template bodies live here so the app, the tests and
// docs/whatsapp.md (which the owner copy-pastes into Meta) cannot drift apart: a test compares them to the document.

/** Version of the opt-in text shown in the checkout (dictionaries `checkout.whatsappOptIn`). Bump it when the wording changes. */
export const WHATSAPP_OPTIN_VERSION = "v1";

export const whatsappKinds = ["confirmation", "deposit_reminder", "arrival_reminder", "post_stay"] as const;
export type WhatsappKind = (typeof whatsappKinds)[number];
export type WhatsappLang = "es" | "en";

/** Meta template names (one set per WhatsApp Business account; the language is a translation of the same name). */
export const WHATSAPP_TEMPLATE_NAMES: Record<WhatsappKind, string> = {
  confirmation: "booking_confirmation",
  deposit_reminder: "deposit_reminder",
  arrival_reminder: "arrival_reminder",
  post_stay: "post_stay",
};

/** Exact bodies to create in Meta (category Utility). {{n}} are positional variables, see `variables`. */
export const WHATSAPP_TEMPLATE_BODIES: Record<WhatsappKind, Record<WhatsappLang, string>> = {
  confirmation: {
    es: "Hola {{1}}, tu reserva en {{2}} está confirmada. Llegada: {{3}}. Salida: {{4}}. Si necesitas algo, responde a este mensaje.",
    en: "Hi {{1}}, your booking at {{2}} is confirmed. Check-in: {{3}}. Check-out: {{4}}. If you need anything, reply to this message.",
  },
  deposit_reminder: {
    es: "Hola {{1}}, tu reserva en {{2}} sigue pendiente de pago. Para confirmarla, paga el adelanto de {{3}} antes de {{4}} (hora de Lima) y sube tu comprobante desde el enlace de tu reserva. Después de esa hora las fechas se liberan.",
    en: "Hi {{1}}, your booking at {{2}} is still waiting for payment. To confirm it, pay the deposit of {{3}} before {{4}} (Lima time) and upload your proof of payment from your booking link. After that time the dates are released.",
  },
  arrival_reminder: {
    es: "Hola {{1}}, te esperamos en {{2}} el {{3}}. Si necesitas indicaciones para llegar o vas a retrasarte, responde a este mensaje.",
    en: "Hi {{1}}, we look forward to welcoming you at {{2}} on {{3}}. If you need directions or you are going to be late, reply to this message.",
  },
  post_stay: {
    es: "Hola {{1}}, gracias por alojarte en {{2}}. Esperamos que hayas tenido una buena estancia. Si quieres comentarnos algo sobre ella, responde a este mensaje.",
    en: "Hi {{1}}, thank you for staying at {{2}}. We hope you had a good stay. If you would like to tell us anything about it, reply to this message.",
  },
};

/** What each positional variable means, and a sample value for Meta's template form (Meta requires examples). */
export const WHATSAPP_TEMPLATE_VARIABLES: Record<WhatsappKind, { es: string[]; en: string[] }> = {
  confirmation: {
    es: ["Ana", "Casa 1", "21 dic 2026", "24 dic 2026"],
    en: ["Ana", "House 1", "Dec 21, 2026", "Dec 24, 2026"],
  },
  deposit_reminder: {
    es: ["Ana", "Casa 1", "S/ 300.00", "20 dic 2026, 18:30"],
    en: ["Ana", "House 1", "S/ 300.00", "Dec 20, 2026, 6:30 PM"],
  },
  arrival_reminder: { es: ["Ana", "Casa 1", "21 dic 2026"], en: ["Ana", "House 1", "Dec 21, 2026"] },
  post_stay: { es: ["Ana", "Casa 1"], en: ["Ana", "House 1"] },
};

// ─── Phone ──────────────────────────────────────────────────────────────────

/**
 * The guest's free-typed phone as the digits-with-country-code the Cloud API wants, or null when it cannot be trusted.
 * `+…` and `00…` are taken as international; a bare 9-digit number starting with 9 is a Peruvian mobile (the checkout is
 * Peruvian); anything else is rejected rather than guessed: a wrong number is a message to a stranger.
 */
export function normalizeWhatsappPhone(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0 || value.length > 30 || !/^[0-9+() -]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  let international: string | null = null;
  if (/^\(?\+/.test(value)) international = digits;
  else if (value.startsWith("00")) international = digits.slice(2);
  else if (/^9[0-9]{8}$/.test(digits)) international = `51${digits}`;
  else if (/^519[0-9]{8}$/.test(digits)) international = digits;
  if (!international || !/^[1-9][0-9]{7,14}$/.test(international)) return null;
  // Peru (+51) mobiles are 9 digits starting with 9; a landline cannot receive WhatsApp.
  if (international.startsWith("51") && !/^519[0-9]{8}$/.test(international)) return null;
  return international;
}

// ─── Messages ───────────────────────────────────────────────────────────────

const claimShape = {
  lang: z.enum(["es", "en"]),
  guest_name: z.string(),
  unit: z.string(),
  check_in: z.iso.date(),
  check_out: z.iso.date(),
  currency: z.enum(["PEN", "USD"]),
  deposit_cents: z.number().int().nonnegative(),
  expires_at: z.iso.datetime({ offset: true }).nullable(),
};
export const whatsappClaimSchema = z.object({
  id: z.uuid(),
  kind: z.enum(whatsappKinds),
  org_id: z.uuid(),
  booking_id: z.uuid(),
  opt_in: z.literal(true),
  phone: z.string().min(1).max(30),
  ...claimShape,
});
export type WhatsappClaim = z.infer<typeof whatsappClaimSchema>;

export type WhatsappMessage = { template: string; language: WhatsappLang; params: string[] };

// Guest-controlled text: no control characters, short enough to read in a chat bubble.
const clean = (value: string, max: number) => value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const firstName = (name: string) => clean(name, 60).split(" ")[0] || "";

const dateFormat = (lang: WhatsappLang) =>
  new Intl.DateTimeFormat(lang === "es" ? "es-PE" : "en-US", { dateStyle: "medium", timeZone: "UTC" });
const stampFormat = (lang: WhatsappLang) =>
  new Intl.DateTimeFormat(lang === "es" ? "es-PE" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" });
const day = (lang: WhatsappLang, iso: string) => dateFormat(lang).format(new Date(`${iso}T00:00:00Z`));
const money = (lang: WhatsappLang, cents: number, currency: "PEN" | "USD") =>
  new Intl.NumberFormat(lang === "es" ? "es-PE" : "en-US", { style: "currency", currency }).format(cents / 100);

/** The template, language and ordered variables for a claimed message. Variables are never empty (Meta rejects empty ones). */
export function buildWhatsappMessage(claim: WhatsappClaim): WhatsappMessage | null {
  const { lang } = claim;
  const name = firstName(claim.guest_name) || (lang === "es" ? "huésped" : "guest");
  const unit = clean(claim.unit, 80) || "—";
  let params: string[];
  switch (claim.kind) {
    case "confirmation":
      params = [name, unit, day(lang, claim.check_in), day(lang, claim.check_out)];
      break;
    case "deposit_reminder":
      if (!claim.expires_at) return null;
      params = [name, unit, money(lang, claim.deposit_cents, claim.currency), stampFormat(lang).format(new Date(claim.expires_at))];
      break;
    case "arrival_reminder":
      params = [name, unit, day(lang, claim.check_in)];
      break;
    case "post_stay":
      params = [name, unit];
      break;
  }
  return { template: WHATSAPP_TEMPLATE_NAMES[claim.kind], language: lang, params };
}
