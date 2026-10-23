import { z } from "zod";

const nonNegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positiveInteger = nonNegativeInteger.min(1);
const identifier = z.string().min(1);

const quoteInputSchema = z.object({
  unit: z.object({
    id: identifier,
    active: z.boolean(),
    maxGuests: positiveInteger,
    includedGuests: positiveInteger,
  }),
  currency: z.enum(["PEN", "USD"]),
  depositPercent: z.number().int().min(0).max(100),
  checkIn: z.string(),
  checkOut: z.string(),
  guests: positiveInteger,
  rates: z.array(z.object({
    id: identifier,
    unitId: identifier,
    seasonId: identifier.nullable(),
    nightlyCents: nonNegativeInteger,
    weekendNightlyCents: nonNegativeInteger.nullable(),
    extraGuestCents: nonNegativeInteger,
    minNights: positiveInteger,
  })),
  seasons: z.array(z.object({
    id: identifier,
    startDate: z.string(),
    endDate: z.string(),
    priority: nonNegativeInteger,
  })),
  fees: z.array(z.object({
    id: identifier,
    unitId: identifier,
    name: z.string().trim().min(1),
    kind: z.enum(["per_stay", "per_night", "per_guest"]),
    amountCents: nonNegativeInteger,
  })),
});

export type QuoteStayInput = z.infer<typeof quoteInputSchema>;
export type PricingRate = QuoteStayInput["rates"][number];
export type PricingSeason = QuoteStayInput["seasons"][number];
export type PricingFee = QuoteStayInput["fees"][number];

export type PricingError =
  | { code: "INVALID_INPUT" }
  | { code: "INVALID_DATES" }
  | { code: "INVALID_CONFIGURATION" }
  | { code: "UNIT_INACTIVE" }
  | { code: "CAPACITY_EXCEEDED"; maxGuests: number }
  | { code: "MIN_NIGHTS"; requiredNights: number }
  | { code: "MISSING_RATE"; date: string }
  | { code: "AMBIGUOUS_SEASON"; date: string }
  | { code: "AMOUNT_OVERFLOW" };

export type NightPrice = {
  date: string;
  rateId: string;
  seasonId: string | null;
  isWeekend: boolean;
  nightlyCents: number;
  extraGuests: number;
  extraGuestUnitCents: number;
  extraGuestTotalCents: number;
  totalCents: number;
};

export type FeePrice = {
  id: string;
  name: string;
  kind: PricingFee["kind"];
  quantity: number;
  unitCents: number;
  totalCents: number;
};

export type StayQuote = {
  unitId: string;
  currency: QuoteStayInput["currency"];
  checkIn: string;
  checkOut: string;
  guests: number;
  nightsCount: number;
  nights: NightPrice[];
  fees: FeePrice[];
  accommodationCents: number;
  feesCents: number;
  totalCents: number;
  depositPercent: number;
  depositCents: number;
  balanceCents: number;
};

export type QuoteStayResult = { ok: true; quote: StayQuote } | { ok: false; error: PricingError };

const DAY_MS = 86_400_000;
const MAX_CENTS = BigInt(Number.MAX_SAFE_INTEGER);
// Keeps an untrusted date span from allocating millions of nightly rows.
// Explicit engine limit, independent of the current date or any timezone.
export const MAX_STAY_NIGHTS = 366;

// Date-only values are civil dates in America/Lima, not instants. UTC here
// is just an arithmetic representation: no machine-local timezone or DST
// participates. Comparing the round trip rejects normalized invalid dates.
function parseDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return null;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
}

function failure(error: PricingError): QuoteStayResult {
  return { ok: false, error };
}

// Pure preview/calculation engine. Authoritative server callers must load
// the unit, rates, seasons, currency, fees and deposit policy from trusted
// server configuration, never forward client-provided prices. This module
// does no I/O or availability checking (calendar constraints own that).
export function quoteStay(rawInput: unknown): QuoteStayResult {
  const parsed = quoteInputSchema.safeParse(rawInput);
  if (!parsed.success) return failure({ code: "INVALID_INPUT" });
  const input = parsed.data;
  const checkIn = parseDate(input.checkIn);
  const checkOut = parseDate(input.checkOut);
  if (checkIn === null || checkOut === null || checkOut <= checkIn) return failure({ code: "INVALID_DATES" });
  const nightsCount = (checkOut - checkIn) / DAY_MS;
  if (nightsCount > MAX_STAY_NIGHTS) return failure({ code: "INVALID_DATES" });
  if (input.unit.includedGuests > input.unit.maxGuests) return failure({ code: "INVALID_CONFIGURATION" });
  if (!input.unit.active) return failure({ code: "UNIT_INACTIVE" });
  if (input.guests > input.unit.maxGuests) return failure({ code: "CAPACITY_EXCEEDED", maxGuests: input.unit.maxGuests });

  const seasonById = new Map<string, PricingSeason & { start: number; end: number }>();
  for (const season of input.seasons) {
    const start = parseDate(season.startDate);
    const end = parseDate(season.endDate);
    if (start === null || end === null || end <= start || seasonById.has(season.id)) return failure({ code: "INVALID_CONFIGURATION" });
    seasonById.set(season.id, { ...season, start, end });
  }

  const rates = input.rates.filter((rate) => rate.unitId === input.unit.id);
  const rateBySeason = new Map<string | null, PricingRate>();
  const rateIds = new Set<string>();
  for (const rate of rates) {
    if (rateIds.has(rate.id) || rateBySeason.has(rate.seasonId) || (rate.seasonId !== null && !seasonById.has(rate.seasonId))) {
      return failure({ code: "INVALID_CONFIGURATION" });
    }
    rateIds.add(rate.id);
    rateBySeason.set(rate.seasonId, rate);
  }
  const unitFees = input.fees.filter((fee) => fee.unitId === input.unit.id);
  if (new Set(unitFees.map((fee) => fee.id)).size !== unitFees.length) return failure({ code: "INVALID_CONFIGURATION" });

  const nights: NightPrice[] = [];
  const extraGuests = Math.max(0, input.guests - input.unit.includedGuests);
  let accommodation = BigInt(0);
  for (let index = 0; index < nightsCount; index++) {
    const ms = checkIn + index * DAY_MS;
    const date = new Date(ms).toISOString().slice(0, 10);
    let winner: (PricingSeason & { start: number; end: number }) | undefined;
    let ambiguous = false;
    for (const season of seasonById.values()) {
      if (ms < season.start || ms >= season.end) continue;
      if (!winner || season.priority > winner.priority) {
        winner = season;
        ambiguous = false;
      } else if (season.priority === winner.priority) {
        ambiguous = true;
      }
    }
    if (ambiguous) return failure({ code: "AMBIGUOUS_SEASON", date });
    // A configured season without a rate is an incomplete price setup, not
    // permission to silently charge the lower base/high-season amount.
    const rate = rateBySeason.get(winner?.id ?? null);
    if (!rate) return failure({ code: "MISSING_RATE", date });
    // The arrival night's rate alone sets the minimum length of this stay.
    if (index === 0 && nightsCount < rate.minNights) return failure({ code: "MIN_NIGHTS", requiredNights: rate.minNights });
    const day = new Date(ms).getUTCDay();
    const isWeekend = day === 5 || day === 6;
    const nightlyCents = isWeekend ? (rate.weekendNightlyCents ?? rate.nightlyCents) : rate.nightlyCents;
    const extras = BigInt(extraGuests) * BigInt(rate.extraGuestCents);
    const total = BigInt(nightlyCents) + extras;
    accommodation += total;
    if (accommodation > MAX_CENTS) return failure({ code: "AMOUNT_OVERFLOW" });
    nights.push({
      date, rateId: rate.id, seasonId: rate.seasonId, isWeekend, nightlyCents,
      extraGuests, extraGuestUnitCents: rate.extraGuestCents, extraGuestTotalCents: Number(extras), totalCents: Number(total),
    });
  }

  const fees: FeePrice[] = [];
  let feesTotal = BigInt(0);
  for (const fee of unitFees) {
    // A per-guest fee is charged once per stay, not once per guest-night.
    const quantity = fee.kind === "per_stay" ? 1 : fee.kind === "per_night" ? nightsCount : input.guests;
    const total = BigInt(fee.amountCents) * BigInt(quantity);
    feesTotal += total;
    if (accommodation + feesTotal > MAX_CENTS) return failure({ code: "AMOUNT_OVERFLOW" });
    fees.push({ id: fee.id, name: fee.name, kind: fee.kind, quantity, unitCents: fee.amountCents, totalCents: Number(total) });
  }
  const total = accommodation + feesTotal;
  // Integer half-up rounding, with no floating-point multiplication of money.
  const deposit = (total * BigInt(input.depositPercent) + BigInt(50)) / BigInt(100);
  return {
    ok: true,
    quote: {
      unitId: input.unit.id, currency: input.currency, checkIn: input.checkIn, checkOut: input.checkOut,
      guests: input.guests, nightsCount, nights, fees, accommodationCents: Number(accommodation), feesCents: Number(feesTotal),
      totalCents: Number(total), depositPercent: input.depositPercent, depositCents: Number(deposit), balanceCents: Number(total - deposit),
    },
  };
}
