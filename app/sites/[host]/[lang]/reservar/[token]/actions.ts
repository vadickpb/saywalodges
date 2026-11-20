"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { allowPublicRequest } from "@/lib/dal/public/rate-limit";
import { bookQuote } from "@/lib/dal/public/quote-checkout";
import { siteIdentifierFromHost } from "@/lib/dal/public/site";
import { getDictionary } from "@/dictionaries";
import { checkoutGuestSchema, type CheckoutState } from "@/lib/domain/quote-checkout";
import { WHATSAPP_OPTIN_VERSION } from "@/lib/domain/whatsapp-templates";

export async function submitCheckout(lang: string, _previous: CheckoutState, form: FormData): Promise<CheckoutState> {
  if (lang !== "es" && lang !== "en") return { error: "generic" };
  const parsed = checkoutGuestSchema.safeParse({
    token: form.get("token"), name: form.get("name"), email: form.get("email"),
    phone: form.get("phone") ?? "", terms: form.get("terms"), whatsapp: form.get("whatsapp") ?? undefined,
  });
  if (!parsed.success) {
    if (parsed.error.issues.some(issue => issue.path[0] === "token")) return { error: "linkUnavailable" };
    const fields: CheckoutState["fields"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "name" || key === "email" || key === "phone" || key === "terms" || key === "token" || key === "whatsapp") fields[key] = true;
    }
    return { error: "validation", fields };
  }
  if (!(await allowPublicRequest("checkout", parsed.data.email))) return { error: "tryLater" };
  let result;
  try {
    const host = siteIdentifierFromHost(((await headers()).get("host") ?? "").toLowerCase());
    // The evidence text comes from the server's dictionary (what the form showed in this language), never from the form.
    const whatsappOptIn = parsed.data.whatsapp
      ? { version: WHATSAPP_OPTIN_VERSION, text: (await getDictionary(lang)).checkout.whatsappOptIn }
      : null;
    result = await bookQuote(host, parsed.data, lang, whatsappOptIn);
  } catch {
    // DAL logs only closed machine codes. Never log the thrown object or form.
    return { error: "generic" };
  }
  if (result.error) return { error: result.error };
  redirect(`/${lang}/reserva/${result.publicToken}`);
}
