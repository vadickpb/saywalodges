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

export type WhatsappOptInEvidence = { version: string; text: string };

export async function bookQuote(host: string, guest: CheckoutGuest, lang: "es" | "en" = "es", whatsappOptIn: WhatsappOptInEvidence | null = null) {
  // Host comes from the request, never from submitted form fields. The quote token
  // remains the capability; this additional check prevents cross-site UI conversion.
  const quote = await getQuoteCheckout(host, guest.token);
  if (!quote) return { error: "linkUnavailable" } as const;
  if ("public_token" in quote) return { publicToken: quote.public_token };
  const client = getSupabaseAnon();
  // The opt-in (SD-1009) is recorded by the same transaction that creates the booking. A guest who did not tick the box
  // sends p_whatsapp_opt_in=false and nothing is recorded: no opt-in, no WhatsApp.
  let { data, error } = await client.rpc("create_checkout_booking", {
    p_lang: lang, p_token: guest.token, p_guest_name: guest.name, p_guest_email: guest.email, p_guest_phone: guest.phone,
    p_whatsapp_opt_in: guest.whatsapp && whatsappOptIn !== null,
    p_whatsapp_text_version: whatsappOptIn?.version ?? "",
    p_whatsapp_text: whatsappOptIn?.text ?? "",
  });
  // Expand/contract deployment: Vercel can deploy before the owner approves SQL.
  // Only a missing RPC permits the older path (which records no WhatsApp opt-in); never retry a business failure.
  if (error?.code === "PGRST202") {
    ({ data, error } = await client.rpc("create_localized_booking_from_quote", {
      p_lang: lang, p_token: guest.token, p_guest_name: guest.name, p_guest_email: guest.email, p_guest_phone: guest.phone || undefined,
    }));
  }
  if (error?.code === "PGRST202") {
    ({ data, error } = await client.rpc("create_booking_from_quote", {
      p_token: guest.token, p_guest_name: guest.name, p_guest_email: guest.email, p_guest_phone: guest.phone || undefined,
    }));
  }
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
