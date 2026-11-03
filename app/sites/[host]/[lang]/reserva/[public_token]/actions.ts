"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { submitVoucher } from "@/lib/dal/public/payment-voucher";
import { siteIdentifierFromHost } from "@/lib/dal/public/site";
import { submitVoucherSchema, type VoucherState } from "@/lib/domain/payment-voucher";

// Registers a voucher the browser has ALREADY uploaded straight to the private bucket (files can exceed the 4.5 MB request limit,
// so they never travel through here). The host comes from the request, never from the form; the amount comes from the booking.
export async function submitVoucherAction(lang: string, _previous: VoucherState, form: FormData): Promise<VoucherState> {
  if (lang !== "es" && lang !== "en") return { error: "generic" };
  const parsed = submitVoucherSchema.safeParse({
    token: form.get("token"), path: form.get("path"), method: form.get("method"), reference: form.get("reference") ?? "",
  });
  if (!parsed.success) return { error: "validation" };
  let result;
  try {
    const host = siteIdentifierFromHost(((await headers()).get("host") ?? "").toLowerCase());
    result = await submitVoucher(host, parsed.data);
  } catch {
    // The DAL logs only closed machine codes. Never log the thrown object or the form.
    return { error: "generic" };
  }
  if (!result.ok) return { error: result.error };
  redirect(`/${lang}/reserva/${parsed.data.token}`);
}
