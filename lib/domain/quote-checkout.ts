import { z } from "zod";
import { PUBLIC_TOKEN_PATTERN } from "./booking-status";

export const checkoutTokenSchema = z.string().regex(PUBLIC_TOKEN_PATTERN);
export const quoteCheckoutSchema = z.union([
  z.object({ public_token: checkoutTokenSchema }).strict(),
  z.object({
    property_name: z.string(), unit_name: z.string(),
    check_in: z.iso.date(), check_out: z.iso.date(), guests: z.number().int().positive(),
    currency: z.enum(["PEN", "USD"]), total_cents: z.number().int().nonnegative(),
    deposit_cents: z.number().int().nonnegative(), balance_cents: z.number().int().nonnegative(),
    expires_at: z.iso.datetime({ offset: true }), hold_minutes: z.number().int().min(15).max(4320),
  }).strict().refine(s => s.deposit_cents + s.balance_cents === s.total_cents),
]);
export const checkoutGuestSchema = z.object({
  token: checkoutTokenSchema,
  // PostgreSQL char_length counts code points; bound UTF-16 length before allocating.
  name: z.string().refine(v => !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(v), {
    message: "Use a name without controls, line separators or text direction characters.",
  }).pipe(z.string().trim().refine(v => v.length > 0 && v.length <= 400 && [...v].length <= 200, {
    message: "Enter a name between 1 and 200 characters.",
  })),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  phone: z.string().trim().max(30).refine(v => v === "" || (v.length >= 5 && /^[0-9+() -]+$/.test(v))),
  terms: z.literal("on"),
});
export type CheckoutGuest = z.infer<typeof checkoutGuestSchema>;
export type CheckoutError = "validation" | "linkUnavailable" | "unbookable" | "unavailable" | "generic";
export type CheckoutState = { error?: CheckoutError; fields?: Partial<Record<keyof CheckoutGuest, boolean>> };
export function checkoutError(code: string): CheckoutError {
  if (code === "SD001" || code === "P0002") return "linkUnavailable";
  if (code === "23P01") return "unavailable";
  if (code === "22023") return "unbookable";
  return "generic";
}
export const checkoutBookingSchema = z.object({ public_token: checkoutTokenSchema, replayed: z.boolean() });
