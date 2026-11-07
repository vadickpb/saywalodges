import { quoteStay, type PricingRate, type PricingSeason } from "./pricing";

// SD-421 part 2: display-only nightly price per date for one unit (the calendar cell label). It delegates to the
// quote engine with a one-night stay, so season priority, weekend rates and "missing rate" behave exactly like a
// real quote. Minimum nights are not enforced here (a 1-night probe would fail), so the rule is skipped by
// raising the probe's rate minimum to 1. Returns null for dates the engine cannot price.
export type NightlyPrices = Record<string, number | null>;

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function nightlyPrices(
  unitId: string, dates: string[], rates: PricingRate[], seasons: PricingSeason[], currency: "PEN" | "USD",
): NightlyPrices {
  const probeRates = rates.filter((rate) => rate.unitId === unitId).map((rate) => ({ ...rate, minNights: 1 }));
  const result: NightlyPrices = {};
  for (const date of dates) {
    const quote = quoteStay({
      unit: { id: unitId, active: true, maxGuests: 1, includedGuests: 1 },
      currency, depositPercent: 0, checkIn: date, checkOut: nextDay(date), guests: 1,
      rates: probeRates, seasons, fees: [],
    });
    result[date] = quote.ok ? quote.quote.nights[0].nightlyCents : null;
  }
  return result;
}
