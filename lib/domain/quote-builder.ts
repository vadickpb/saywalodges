import { z } from "zod";
import type { StayQuote } from "@/lib/domain/pricing";

// How long a shared quote link stays valid.
export const QUOTE_VALID_HOURS = 72;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

// The only fields a client may submit. Amounts, currency, rates and the
// deposit never appear here: zod strips anything else, and the server
// recomputes them from stored pricing (ADR 0006, ADR 0009).
const scenario = z.object({
  unitId: z.uuid("Unidad inválida"),
  checkIn: isoDate,
  checkOut: isoDate,
  guests: z.coerce.number().int("Huéspedes inválidos").min(1, "Indica al menos 1 huésped").max(1000, "Huéspedes inválidos"),
});
const checkoutAfterCheckin = (v: { checkIn: string; checkOut: string }) => v.checkOut > v.checkIn;
const orderIssue = { path: ["checkOut"], message: "La salida debe ser posterior a la entrada" };

export const quoteRequestSchema = scenario.refine(checkoutAfterCheckin, orderIssue);
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

export type QuoteMessageLang = "es" | "en";
// Creating a quote also picks the language of the message the owner shares.
export const createQuoteRequestSchema = scenario
  .extend({ lang: z.enum(["es", "en"], "Idioma inválido") })
  .refine(checkoutAfterCheckin, orderIssue);
export type CreateQuoteRequest = z.infer<typeof createQuoteRequestSchema>;

// What gets stored in quotes.breakdown. Everything the engine derived, so a quote can be audited later
// and the database can check the amounts agree with it (create_quote, ADR 0009).
export function toQuoteBreakdown(quote: StayQuote) {
  return {
    accommodationCents: quote.accommodationCents,
    feesCents: quote.feesCents,
    totalCents: quote.totalCents,
    depositPercent: quote.depositPercent,
    depositCents: quote.depositCents,
    balanceCents: quote.balanceCents,
    nights: quote.nights,
    fees: quote.fees,
  };
}

export type QuoteMessageInput = {
  lang: QuoteMessageLang;
  unitName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  totalLabel: string;
  depositLabel?: string;
  expiresOn: string;
  link: string;
};

export function buildQuoteMessage(m: QuoteMessageInput): string {
  if (m.lang === "en") {
    return [
      `Hi! Here is your quote for ${m.unitName}:`,
      `${m.checkIn} → ${m.checkOut} (${m.nights} night${m.nights === 1 ? "" : "s"}, ${m.guests} guest${m.guests === 1 ? "" : "s"})`,
      `Total: ${m.totalLabel}`,
      ...(m.depositLabel ? [`Deposit to book: ${m.depositLabel}`] : []),
      `Book here (valid until ${m.expiresOn}): ${m.link}`,
    ].join("\n");
  }
  return [
    `¡Hola! Esta es tu cotización para ${m.unitName}:`,
    `${m.checkIn} → ${m.checkOut} (${m.nights} noche${m.nights === 1 ? "" : "s"}, ${m.guests} huésped${m.guests === 1 ? "" : "es"})`,
    `Total: ${m.totalLabel}`,
    ...(m.depositLabel ? [`Adelanto para reservar: ${m.depositLabel}`] : []),
    `Reserva aquí (válido hasta el ${m.expiresOn}): ${m.link}`,
  ].join("\n");
}

// wa.me accepts digits only; without a valid phone it opens the contact picker.
export function whatsappShareUrl(text: string, phone?: string | null): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const base = digits.length >= 8 && digits.length <= 15 ? `https://wa.me/${digits}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}

// Public address of a tenant site: its own domain if it has one, else <subdomain>.<ROOT_DOMAIN> (ADR 0001).
export function siteOrigin(p: { subdomain: string; customDomain: string | null; rootDomain: string }): string | null {
  const custom = p.customDomain?.trim();
  const sub = p.subdomain.trim();
  const host = custom || (sub ? `${sub}.${p.rootDomain}` : "");
  if (!host) return null;
  const local = host === "localhost" || host.startsWith("localhost:") || /\.localhost(:\d+)?$/.test(host);
  return `${local ? "http" : "https"}://${host}`;
}

// The page behind this link is the booking checkout (SD-403).
export function quoteLinkUrl(origin: string, lang: QuoteMessageLang, token: string): string {
  return `${origin}/${lang}/reservar/${encodeURIComponent(token)}`;
}

// A timestamp shown as a calendar day in Lima (stays are civil dates in America/Lima).
export function limaDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
