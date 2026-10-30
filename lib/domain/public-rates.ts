import { addDays, isIsoDate, type IsoDate } from "./dates";

// Pure helpers for the public "Rates" section (SD-208). Everything shown is
// derived from the tenant's own numeric rates; the "from" figure is a
// presentation minimum, never a quote (lib/domain/pricing.ts owns quotes).

export type PublicCurrency = "PEN" | "USD";

export type PublicUnit = { id: string; active: boolean };
export type PublicSeason = { id: string; name: string; startDate: IsoDate; endDate: IsoDate };
export type PublicRate = {
  unitId: string;
  seasonId: string | null;
  nightlyCents: number;
  weekendNightlyCents: number | null;
};

export type PublicRateCard = {
  key: string;
  // null for the base (year-round) rate.
  season: { name: string; startDate: IsoDate; endDate: IsoDate } | null;
  fromCents: number;
};

export type PublicRates = {
  currency: PublicCurrency;
  cards: PublicRateCard[];
  // Lowest nightly price across every card; null when nothing is priced.
  fromCents: number | null;
};

// Lowest per-night price the rate can produce (a weekend price can be lower).
function lowestNight(rate: PublicRate): number {
  return rate.weekendNightlyCents === null ? rate.nightlyCents : Math.min(rate.nightlyCents, rate.weekendNightlyCents);
}

/**
 * Builds the cards of the public Rates section. Rates of inactive or unknown
 * units are ignored, seasons that already ended on `today` are dropped, and a
 * season with no usable rate produces no card (a missing rate is hidden, never
 * shown as zero). `today` is injected so callers pass the Lima civil date.
 */
export function buildPublicRates(input: {
  currency: PublicCurrency;
  units: PublicUnit[];
  seasons: PublicSeason[];
  rates: PublicRate[];
  today: IsoDate;
}): PublicRates {
  const activeUnits = new Set(input.units.filter((unit) => unit.active).map((unit) => unit.id));
  const lowestBySeason = new Map<string | null, number>();
  for (const rate of input.rates) {
    if (!activeUnits.has(rate.unitId)) continue;
    const night = lowestNight(rate);
    const current = lowestBySeason.get(rate.seasonId);
    if (current === undefined || night < current) lowestBySeason.set(rate.seasonId, night);
  }

  const cards: PublicRateCard[] = [];
  const base = lowestBySeason.get(null);
  if (base !== undefined) cards.push({ key: "base", season: null, fromCents: base });

  const upcoming = input.seasons
    .filter((season) => isIsoDate(season.startDate) && isIsoDate(season.endDate) && season.endDate > input.today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
  for (const season of upcoming) {
    const fromCents = lowestBySeason.get(season.id);
    if (fromCents === undefined) continue;
    cards.push({
      key: season.id,
      season: { name: season.name, startDate: season.startDate, endDate: season.endDate },
      fromCents,
    });
  }

  const fromCents = cards.length > 0 ? Math.min(...cards.map((card) => card.fromCents)) : null;
  return { currency: input.currency, cards, fromCents };
}

const LOCALES = { es: "es-PE", en: "en-US" } as const;
const SYMBOLS: Record<PublicCurrency, string> = { PEN: "S/", USD: "US$" };

/** "S/ 220" or "US$ 220.50": whole amounts drop the decimals. Currency comes from the property. */
export function formatPublicPrice(cents: number, currency: PublicCurrency, lang: string): string {
  const amount = new Intl.NumberFormat(lang === "es" ? LOCALES.es : LOCALES.en, {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return `${SYMBOLS[currency]} ${amount}`;
}

/** Inclusive date range of a season ("[start, end)" stored; the last night is end - 1). */
export function formatSeasonRange(startDate: IsoDate, endDate: IsoDate, lang: string): string {
  const fmt = new Intl.DateTimeFormat(lang === "es" ? LOCALES.es : LOCALES.en, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const at = (date: IsoDate) => fmt.format(new Date(`${date}T00:00:00Z`));
  const lastNight = addDays(endDate, -1);
  return lastNight === startDate ? at(startDate) : `${at(startDate)} – ${at(lastNight)}`;
}
