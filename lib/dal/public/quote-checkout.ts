import "server-only";
import { getSupabaseAnon } from "@/lib/supabase/anon";
import { log } from "@/lib/log";
import { checkoutBookingSchema, checkoutError, checkoutTokenSchema, quoteCheckoutSchema, type CheckoutGuest } from "@/lib/domain/quote-checkout";

export async function getQuoteCheckout(host: string, token: string) {
  if (!checkoutTokenSchema.safeParse(token).success || !host || host.length > 253) return null;
  const { data, error } = await getSupabaseAnon().rpc("get_quote_checkout", { p_host: host, p_token: token });
  if (error) {
    log("error", "checkout.read.failed", { code: error.code });
    throw new Error("Checkout unavailable");
  }
  if (data === null) return null;
  const parsed = quoteCheckoutSchema.safeParse(data);
  if (!parsed.success) {
    log("error", "checkout.read.failed", { code: "INVALID_RESPONSE" });
    throw new Error("Checkout unavailable");
  }
  return parsed.data;
}

export async function bookQuote(host: string, guest: CheckoutGuest) {
  // Host comes from the request, never from submitted form fields. The quote token
  // remains the capability; this additional check prevents cross-site UI conversion.
  const quote = await getQuoteCheckout(host, guest.token);
  if (!quote) return { error: "invalid" } as const;
  if ("public_token" in quote) return { publicToken: quote.public_token };
  const { data, error } = await getSupabaseAnon().rpc("create_booking_from_quote", {
    p_token: guest.token, p_guest_name: guest.name, p_guest_email: guest.email, p_guest_phone: guest.phone || undefined,
  });
  if (error) {
    log("error", "checkout.book.failed", { code: error.code });
    return { error: checkoutError(error.code) };
  }
  const parsed = checkoutBookingSchema.safeParse(data);
  if (!parsed.success) {
    log("error", "checkout.book.failed", { code: "INVALID_RESPONSE" });
    return { error: "generic" } as const;
  }
  return { publicToken: parsed.data.public_token };
}
