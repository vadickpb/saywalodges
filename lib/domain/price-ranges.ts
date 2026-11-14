import { z } from "zod";
import { parseDateRange } from "./availability";
import { daysBetween } from "./dates";
import { moneySchema } from "./rates-management";

// SD-421 part 3: change the nightly price of ONE house for a date range. Dates are [start, end): `end` is the first night that
// is NOT changed (the check-out day), like every stay in the system. The amount is exact decimal text turned into cents here;
// the database re-validates everything and the pricing engines apply it (private.price_stay / quoteStay).
export const MAX_PRICE_RANGE_NIGHTS = 366;

const rangeDates = { start: z.string(), end: z.string() };
function checkRange(input: { start: string; end: string }, ctx: z.RefinementCtx) {
  const parsed = parseDateRange(input.start, input.end);
  if (!parsed.ok) ctx.addIssue({ code: "custom", path: ["end"], message: "Ingresa fechas válidas; el fin debe ser posterior al inicio." });
  else if (daysBetween(input.start, input.end) > MAX_PRICE_RANGE_NIGHTS) ctx.addIssue({ code: "custom", path: ["end"], message: "El cambio admite hasta 366 noches." });
}

const optionalMinNights = z.string().trim().regex(/^\d{0,3}$/, "Ingresa un número entero")
  .transform((text) => (text === "" ? null : Number(text))).pipe(z.number().int().min(1, "Mínimo 1 noche").max(365, "Máximo 365 noches").nullable());

export const priceRangeSchema = z.object({
  unitId: z.uuid("Selecciona una unidad."),
  ...rangeDates,
  price: moneySchema,
  minNights: optionalMinNights,
}).superRefine(checkRange);
export type PriceRangeInput = z.infer<typeof priceRangeSchema>;

export const clearPriceRangeSchema = z.object({ unitId: z.uuid("Selecciona una unidad."), ...rangeDates }).superRefine(checkRange);
export type ClearPriceRangeInput = z.infer<typeof clearPriceRangeSchema>;
