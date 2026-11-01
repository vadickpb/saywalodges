import "server-only";
import { z } from "zod";
import { getCalendarContext } from "@/lib/dal/calendar";
import { getPricingData } from "@/lib/dal/rates";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { quoteStay, type PricingError, type QuoteStayResult, type StayQuote } from "@/lib/domain/pricing";
import { QUOTE_VALID_HOURS, siteOrigin, toQuoteBreakdown, type QuoteRequest } from "@/lib/domain/quote-builder";

export const QUOTES_ERROR = "No se pudo completar la operación de cotizaciones. Intenta de nuevo.";

type Prepared = {
  ctx: NonNullable<Awaited<ReturnType<typeof getCalendarContext>>>;
  unitName: string;
  result: QuoteStayResult;
  // Advisory only: the calendar_blocks exclusion constraint is the authority when booking (ADR 0003).
  available: boolean;
  origin: string | null;
};

// Everything the quote needs comes from the verified tenant (ADR 0009): its units, rates, seasons, fees,
// currency and deposit policy. The request carries only the scenario, never an amount.
async function prepare(input: QuoteRequest): Promise<Prepared | null> {
  const ctx = await getCalendarContext();
  const data = await getPricingData();
  const unit = data?.units.find((u) => u.id === input.unitId);
  if (!ctx || !data || !unit) return null;

  const property = await ctx.supabase.from("properties").select("deposit_percent, subdomain, custom_domain")
    .eq("id", ctx.propertyId).eq("org_id", ctx.orgId).single();
  if (property.error) {
    log("error", "quotes.property_read_failed", { code: property.error.code });
    throw new Error(QUOTES_ERROR);
  }

  const result = quoteStay({
    ...input, unit, depositPercent: property.data.deposit_percent, currency: data.currency,
    rates: data.rates, seasons: data.seasons, fees: data.fees,
  });

  // Holds that already expired do not block the dates: create_booking_from_quote releases them first.
  const nowIso = new Date().toISOString();
  const { data: blocks, error } = await ctx.supabase.from("calendar_blocks").select("id")
    .eq("org_id", ctx.orgId).eq("property_id", ctx.propertyId).eq("unit_id", unit.id)
    .overlaps("period", `[${input.checkIn},${input.checkOut})`)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`).limit(1);
  if (error) {
    log("error", "quotes.availability_failed", { code: error.code });
    throw new Error(QUOTES_ERROR);
  }

  return {
    ctx, unitName: unit.name, result, available: blocks.length === 0,
    origin: siteOrigin({ subdomain: property.data.subdomain, customDomain: property.data.custom_domain, rootDomain: env.ROOT_DOMAIN }),
  };
}

export type QuotePreview = { unitName: string; result: QuoteStayResult; available: boolean };

// Read-only: nothing is persisted.
export async function previewQuote(input: QuoteRequest): Promise<QuotePreview | null> {
  const prepared = await prepare(input);
  return prepared ? { unitName: prepared.unitName, result: prepared.result, available: prepared.available } : null;
}

const createdSchema = z.object({
  quote_id: z.uuid(),
  token: z.string().min(32),
  expires_at: z.string().min(1),
});

export type CreateQuoteResult =
  | { ok: true; token: string; expiresAt: string; unitName: string; quote: StayQuote; origin: string }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "unavailable" }
  | { ok: false; reason: "no_address" }
  | { ok: false; reason: "pricing"; error: PricingError };

// Persists a quote through create_quote (ADR 0009). The price is recomputed here from stored pricing; the
// database re-checks membership, unit scope, capacity, dates and that the amounts match the stored deposit policy.
export async function createQuote(input: QuoteRequest): Promise<CreateQuoteResult> {
  const prepared = await prepare(input);
  if (!prepared) return { ok: false, reason: "not_found" };
  if (!prepared.result.ok) return { ok: false, reason: "pricing", error: prepared.result.error };
  if (!prepared.available) return { ok: false, reason: "unavailable" };
  // Before storing anything: a quote nobody can open would still use up the org's quota.
  if (!prepared.origin) return { ok: false, reason: "no_address" };
  const { quote } = prepared.result;
  const { ctx } = prepared;

  const { data, error } = await ctx.supabase.rpc("create_quote", {
    p_org_id: ctx.orgId,
    p_unit_id: input.unitId,
    p_check_in: input.checkIn,
    p_check_out: input.checkOut,
    p_guests: input.guests,
    p_total_cents: quote.totalCents,
    p_deposit_cents: quote.depositCents,
    p_breakdown: toQuoteBreakdown(quote),
    p_valid_hours: QUOTE_VALID_HOURS,
  });
  if (error) {
    log("error", "quotes.create.rpc_failed", { code: error.code });
    throw new Error(QUOTES_ERROR);
  }
  const created = createdSchema.safeParse(data);
  if (!created.success) {
    log("error", "quotes.create.bad_result");
    throw new Error(QUOTES_ERROR);
  }
  return { ok: true, token: created.data.token, expiresAt: created.data.expires_at, unitName: prepared.unitName, quote, origin: prepared.origin };
}

export type OpenQuote = {
  id: string; token: string; unitName: string; checkIn: string; checkOut: string; guests: number;
  currency: "PEN" | "USD"; totalCents: number; expiresAt: string;
};

// Unexpired quotes that have not become a booking yet. RLS (is_member) scopes the rows; org is also filtered.
export async function listOpenQuotes(): Promise<{ quotes: OpenQuote[]; origin: string | null }> {
  const ctx = await getCalendarContext();
  if (!ctx) return { quotes: [], origin: null };
  const { supabase, orgId, propertyId } = ctx;
  const [quotes, property] = await Promise.all([
    supabase.from("quotes").select("id, token, unit_id, check_in, check_out, guests, currency, total_cents, expires_at")
      .eq("org_id", orgId).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(50),
    supabase.from("properties").select("subdomain, custom_domain").eq("id", propertyId).eq("org_id", orgId).single(),
  ]);
  if (quotes.error || property.error) {
    log("error", "quotes.list_failed", { code: (quotes.error ?? property.error)?.code });
    throw new Error(QUOTES_ERROR);
  }
  const origin = siteOrigin({ subdomain: property.data.subdomain, customDomain: property.data.custom_domain, rootDomain: env.ROOT_DOMAIN });
  if (!quotes.data.length) return { quotes: [], origin };
  const [bookings, units] = await Promise.all([
    supabase.from("bookings").select("quote_id").eq("org_id", orgId).in("quote_id", quotes.data.map((q) => q.id)),
    supabase.from("units").select("id, name").eq("org_id", orgId),
  ]);
  if (bookings.error || units.error) {
    log("error", "quotes.list_failed", { code: (bookings.error ?? units.error)?.code });
    throw new Error(QUOTES_ERROR);
  }
  const booked = new Set(bookings.data.map((b) => b.quote_id));
  const names = new Map(units.data.map((u) => [u.id, u.name]));
  return {
    origin,
    quotes: quotes.data.filter((q) => !booked.has(q.id)).map((q) => ({
      id: q.id, token: q.token, unitName: names.get(q.unit_id) ?? "—", checkIn: q.check_in, checkOut: q.check_out,
      guests: q.guests, currency: q.currency, totalCents: q.total_cents, expiresAt: q.expires_at,
    })),
  };
}
