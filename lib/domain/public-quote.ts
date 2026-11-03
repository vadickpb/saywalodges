import { z } from "zod";

// Guest self-service quote (SD-404, ADR 0012). Pure: the request the public site sends and how the database's answer is read.
// The request carries NO money: the database prices the stay from its own rates.

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v));

export const publicQuoteRequestSchema = z
  .object({
    unitId: z.string().uuid(),
    checkIn: isoDate,
    checkOut: isoDate,
    guests: z.coerce.number().int().min(1).max(100),
    lang: z.enum(["es", "en"]),
  })
  .refine((v) => v.checkOut > v.checkIn, { path: ["checkOut"] });
export type PublicQuoteRequest = z.infer<typeof publicQuoteRequestSchema>;

/** What the screen can tell the guest. `contact` = it cannot be booked online: ask the lodging. */
export type PublicQuoteError =
  | "unitNotFound"
  | "invalidDates"
  | "minNights"
  | "capacity"
  | "unavailable"
  | "contact"
  | "tryLater"
  | "validation"
  | "generic";
export type PublicQuoteState = { error?: PublicQuoteError; requiredNights?: number; maxGuests?: number; fields?: Partial<Record<"unitId" | "checkIn" | "checkOut" | "guests", true>> };

const okSchema = z.object({ ok: z.literal(true), token: z.string().regex(/^[a-f0-9]{64}$/), expires_at: z.string(), currency: z.enum(["PEN", "USD"]), total_cents: z.number().int().nonnegative(), deposit_cents: z.number().int().nonnegative(), nights: z.number().int().positive() });
const failSchema = z.object({ ok: z.literal(false), error: z.string(), requiredNights: z.number().int().positive().optional(), maxGuests: z.number().int().positive().optional() });
export const publicQuoteResultSchema = z.union([okSchema, failSchema]);

/** Maps the database's business error code to what the screen shows. Unknown codes are generic, never raw. */
export function publicQuoteError(code: string, extra: { requiredNights?: number; maxGuests?: number } = {}): PublicQuoteState {
  switch (code) {
    case "UNIT_NOT_FOUND":
    case "UNIT_INACTIVE":
      return { error: "unitNotFound" };
    case "INVALID_DATES":
      return { error: "invalidDates" };
    case "MIN_NIGHTS":
      return { error: "minNights", requiredNights: extra.requiredNights };
    case "CAPACITY_EXCEEDED":
      return { error: "capacity", maxGuests: extra.maxGuests };
    case "DATES_UNAVAILABLE":
      return { error: "unavailable" };
    case "MISSING_RATE":
    case "AMBIGUOUS_SEASON":
    case "INVALID_CONFIGURATION":
    case "AMOUNT_OVERFLOW":
      return { error: "contact" };
    default:
      return { error: "generic" };
  }
}

/** Database errors (abuse caps, malformed input) that are not business outcomes. */
export function publicQuoteRpcError(sqlState: string | undefined): PublicQuoteState {
  if (sqlState === "54000") return { error: "tryLater" };
  if (sqlState === "22023" || sqlState === "22004") return { error: "validation" };
  return { error: "generic" };
}
