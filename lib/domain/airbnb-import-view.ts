import { formatPrice } from "./rates-management";

// Payout rows can contain currencies outside the PEN/USD reservation ledger.
export function formatAirbnbTotal(cents: number, currency: string): string {
  if (currency === "PEN" || currency === "USD") return formatPrice(cents, currency);
  const amount = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
  return `${currency || "Sin moneda"} ${amount}`;
}
