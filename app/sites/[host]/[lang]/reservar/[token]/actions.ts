"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { bookQuote } from "@/lib/dal/public/quote-checkout";
import { siteIdentifierFromHost } from "@/lib/dal/public/site";
import { checkoutGuestSchema, type CheckoutState } from "@/lib/domain/quote-checkout";

export async function submitCheckout(lang: string, _previous: CheckoutState, form: FormData): Promise<CheckoutState> {
  if (lang !== "es" && lang !== "en") return { error: "generic" };
  const parsed = checkoutGuestSchema.safeParse({
    token: form.get("token"), name: form.get("name"), email: form.get("email"),
    phone: form.get("phone") ?? "", terms: form.get("terms"),
  });
  if (!parsed.success) {
    const fields: CheckoutState["fields"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "name" || key === "email" || key === "phone" || key === "terms" || key === "token") fields[key] = true;
    }
    return { error: "invalid", fields };
  }
  let result;
  try {
    const host = siteIdentifierFromHost(((await headers()).get("host") ?? "").toLowerCase());
    result = await bookQuote(host, parsed.data);
  } catch {
    // DAL logs only closed machine codes. Never log the thrown object or form.
    return { error: "generic" };
  }
  if (result.error) return { error: result.error };
  redirect(`/${lang}/reserva/${result.publicToken}`);
}
