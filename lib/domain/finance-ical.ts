import { z } from "zod";
import { positiveMoneySchema } from "./finance";
import { currency, currencyAndRate, fxRate, isoDate, optional, uuid } from "./finance-forms";

// "Alquileres por completar" (SD-807): an imported Airbnb/Booking stay only carries
// dates, so the owner types what they received. Nothing here guesses an amount.
// Pure: the action parses the form strings with this schema, then calls the DAL.

export const completeRentalFormSchema = z
  .object({
    blockId: uuid,
    amount: positiveMoneySchema,
    currency,
    fxRate: optional(fxRate),
    occurredOn: isoDate,
    guests: optional(z.coerce.number({ error: "Usa un número entero" }).int("Usa un número entero").min(1, "Mínimo 1").max(1000, "Máximo 1000")),
    cleaning: optional(positiveMoneySchema),
  })
  .superRefine(currencyAndRate);
export type CompleteRentalForm = z.infer<typeof completeRentalFormSchema>;

// What the RPC answers; parsed instead of cast.
export const completeRentalResultSchema = z.object({ rental_id: z.string().uuid(), replayed: z.boolean() });

export type PendingRental = {
  blockId: string;
  unitId: string;
  unitName: string;
  channel: "airbnb" | "booking";
  stayStart: string;
  stayEnd: string;
  suggestedCleaningCents: number | null;
  currency: "PEN" | "USD";
};
