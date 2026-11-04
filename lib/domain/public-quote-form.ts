import type { Dict } from "@/dictionaries/en";
import type { PublicQuoteState } from "./public-quote";
import { format } from "./format";

export type QuoteUnit = { id: string; name: string; maxGuests: number };

// Unknown units have no selectable capacity. The database remains authoritative.
export function quoteGuestLimit(units: QuoteUnit[], unitId: string): number {
  return units.find(unit => unit.id === unitId)?.maxGuests ?? 0;
}

export function clampQuoteGuests(guests: number, maxGuests: number): number {
  return Math.max(1, Math.min(guests, maxGuests));
}

export function quoteErrorText(state: PublicQuoteState, t: Dict["publicQuote"]): string | null {
  if (!state.error) return null;
  if (state.error === "minNights" && state.requiredNights) return format(t.minNightsCount, { n: state.requiredNights });
  if (state.error === "capacity" && state.maxGuests) return format(t.capacityCount, { n: state.maxGuests });
  return t[state.error];
}
