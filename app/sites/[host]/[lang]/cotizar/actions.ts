"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { allowPublicRequest } from "@/lib/dal/public/rate-limit";
import { createPublicQuote } from "@/lib/dal/public/public-quote";
import { siteIdentifierFromHost } from "@/lib/dal/public/site";
import { publicQuoteRequestSchema, type PublicQuoteState } from "@/lib/domain/public-quote";

// A guest quotes a stay from the public site (SD-404). The form sends only unit, dates and guests: the database prices the stay (ADR 0012).
// On success the guest continues to the same checkout the owner's quote links open (SD-403).
export async function submitPublicQuote(lang: string, _previous: PublicQuoteState, form: FormData): Promise<PublicQuoteState> {
  if (lang !== "es" && lang !== "en") return { error: "generic" };
  const parsed = publicQuoteRequestSchema.safeParse({
    unitId: form.get("unitId"), checkIn: form.get("checkIn"), checkOut: form.get("checkOut"), guests: form.get("guests"), lang,
  });
  if (!parsed.success) {
    const fields: NonNullable<PublicQuoteState["fields"]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "unitId" || key === "checkIn" || key === "checkOut" || key === "guests") fields[key] = true;
    }
    return { error: "validation", fields };
  }
  if (!(await allowPublicRequest("quote"))) return { error: "tryLater" };
  let result;
  try {
    const host = siteIdentifierFromHost(((await headers()).get("host") ?? "").toLowerCase());
    result = await createPublicQuote(host, parsed.data);
  } catch {
    // The DAL logs only closed machine codes. Never log the thrown object or the form.
    return { error: "generic" };
  }
  if (!result.ok) return { error: result.error, requiredNights: result.requiredNights, maxGuests: result.maxGuests };
  redirect(`/${lang}/reservar/${result.token}`);
}
