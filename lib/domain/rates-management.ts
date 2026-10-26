import { z } from "zod";
import type { PricingError } from "./pricing";

const PG_MAX = 2147483647;
export const pricingSectionSchema = z.enum(["rates", "seasons", "fees"]);
export type PricingSection = z.infer<typeof pricingSectionSchema>;
export const FEE_LABELS = { per_stay: "Por estancia", per_night: "Por noche", per_guest: "Por huésped (una vez por estancia)" };

// Decimal text is converted exactly; no floating-point money multiplication.
export const moneySchema = z.string().trim().max(12).regex(/^\d+(?:[.,]\d{1,2})?$/, "Usa un importe positivo con hasta 2 decimales")
  .transform((text) => {
    const [whole, fraction = ""] = text.replace(",", ".").split(".");
    return Number(BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0")));
  }).pipe(z.number().int().max(PG_MAX, "Importe demasiado grande"));
const integer = z.string().trim().regex(/^\d+$/, "Ingresa un número entero")
  .transform(Number).pipe(z.number().int().min(0).max(PG_MAX));
const date = z.string().date("Ingresa una fecha válida").refine((value) => !value.startsWith("0000-"), "Ingresa una fecha válida");
const name = z.string().trim().min(1, "Obligatorio").max(200, "Máximo 200 caracteres");
export const seasonInputSchema = z.object({
  name, startDate: date, endDate: date, priority: integer,
}).refine((v) => v.endDate > v.startDate, { path: ["endDate"], message: "Debe ser posterior al inicio" });
export const rateInputSchema = z.object({
  unitId: z.uuid(), seasonId: z.union([z.literal(""), z.uuid()]).transform((v) => v || null),
  nightlyAmount: moneySchema,
  weekendAmount: z.union([z.literal(""), moneySchema]).transform((v) => v === "" ? null : v),
  extraAmount: moneySchema, minNights: integer.pipe(z.number().min(1, "Mínimo 1 noche")),
});
export const feeInputSchema = z.object({
  unitId: z.uuid(), name, kind: z.enum(["per_stay", "per_night", "per_guest"]), amount: moneySchema,
});
export const simulationSchema = z.object({
  unitId: z.uuid(), checkIn: date, checkOut: date,
  guests: integer.pipe(z.number().min(1)), depositPercent: integer.pipe(z.number().max(100)),
}).refine((v) => v.checkOut > v.checkIn, { path: ["checkOut"], message: "La salida debe ser posterior a la entrada" });
export type SeasonInput = z.infer<typeof seasonInputSchema>;
export type RateInput = z.infer<typeof rateInputSchema>;
export type FeeInput = z.infer<typeof feeInputSchema>;

export function centsToInput(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
export function formatPrice(cents: number, currency: "PEN" | "USD"): string {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency }).format(cents / 100);
}
export function pricingErrorMessage(error: PricingError): string {
  switch (error.code) {
    case "CAPACITY_EXCEEDED": return `La unidad admite hasta ${error.maxGuests} huéspedes.`;
    case "MIN_NIGHTS": return `La llegada seleccionada requiere al menos ${error.requiredNights} noches.`;
    case "MISSING_RATE": return `Falta configurar una tarifa para la noche del ${error.date}.`;
    case "UNIT_INACTIVE": return "Activa la unidad para simular una estancia.";
    case "INVALID_DATES": return "Selecciona una estancia de 1 a 366 noches.";
    case "AMBIGUOUS_SEASON": return `Hay temporadas con la misma prioridad el ${error.date}. Revisa las fechas.`;
    case "AMOUNT_OVERFLOW": return "El importe calculado es demasiado grande.";
    case "INVALID_CONFIGURATION": return "Revisa la configuración de temporadas, tarifas y capacidad.";
    case "INVALID_INPUT": return "Revisa los datos de la simulación.";
  }
}
