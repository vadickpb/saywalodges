import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { VOUCHER_BUCKET } from "@/lib/domain/payment-voucher";

// Reading a stored voucher (SD-405, used by the bookings screen of SD-406). Members only: the payment is read through the
// caller's session (RLS: is_member) and the file through a signed URL that expires in a minute. The bucket itself is private and
// its select policy is members-only too, so a leaked URL stops working fast and nothing is ever public. The service role is not used.
type Client = SupabaseClient<Database>;

export const VOUCHER_URL_TTL_SECONDS = 60;

export async function getVoucherSignedUrl(supabase: Client, orgId: string, paymentId: string): Promise<string | null> {
  const payment = await supabase.from("payments").select("voucher_path").eq("id", paymentId).eq("org_id", orgId).maybeSingle();
  if (payment.error) {
    console.error("getVoucherSignedUrl: payment read failed:", payment.error.code);
    throw new Error("No se pudo cargar el comprobante.");
  }
  const path = payment.data?.voucher_path;
  // Defence in depth: the folder must be this organization's, whatever the row says.
  if (!path || !path.startsWith(`${orgId}/`)) return null;

  const signed = await supabase.storage.from(VOUCHER_BUCKET).createSignedUrl(path, VOUCHER_URL_TTL_SECONDS);
  if (signed.error || !signed.data) {
    console.error("getVoucherSignedUrl: signing failed");
    throw new Error("No se pudo cargar el comprobante.");
  }
  return signed.data.signedUrl;
}
