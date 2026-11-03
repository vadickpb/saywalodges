import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { VOUCHER_BUCKET } from "@/lib/domain/payment-voucher";

// Reading a stored voucher (SD-405, used by the bookings screen of SD-406). Members only: the payment is read through the
// caller's session (RLS: is_member) and the file through a signed URL that expires in a minute. The bucket itself is private and
// its select policy is members-only too, so a leaked URL stops working fast and nothing is ever public. The service role is not used.
type Client = SupabaseClient<Database>;

export const VOUCHER_URL_TTL_SECONDS = 60;

// `bookingId` ties the payment to the booking whose page asked for it. `download` serves the file as an attachment (Content-Disposition),
// used for PDFs so the browser does not render active content inside the owner's session.
export async function getVoucherSignedUrl(
  supabase: Client, orgId: string, paymentId: string, opts: { bookingId?: string; download?: boolean } = {},
): Promise<string | null> {
  let query = supabase.from("payments").select("voucher_path").eq("id", paymentId).eq("org_id", orgId);
  if (opts.bookingId) query = query.eq("booking_id", opts.bookingId);
  const payment = await query.maybeSingle();
  if (payment.error) {
    console.error("getVoucherSignedUrl: payment read failed:", payment.error.code);
    throw new Error("No se pudo cargar el comprobante.");
  }
  const path = payment.data?.voucher_path;
  // Defence in depth: the folder must be this organization's, whatever the row says.
  if (!path || !path.startsWith(`${orgId}/`)) return null;

  // A PDF can carry active content and comes from an untrusted guest: it is ALWAYS served as an attachment, whatever the caller asked.
  const asAttachment = opts.download || path.toLowerCase().endsWith(".pdf");
  const signed = await supabase.storage.from(VOUCHER_BUCKET).createSignedUrl(path, VOUCHER_URL_TTL_SECONDS, asAttachment ? { download: true } : undefined);
  if (signed.error || !signed.data) {
    console.error("getVoucherSignedUrl: signing failed");
    throw new Error("No se pudo cargar el comprobante.");
  }
  return signed.data.signedUrl;
}
