import "server-only";
import { getSupabaseAnon } from "@/lib/supabase/anon";
import { log } from "@/lib/log";
import { PUBLIC_TOKEN_PATTERN } from "@/lib/domain/booking-status";
import { paymentInfoSchema, voucherError, type PaymentInfo, type SubmitVoucherInput, type VoucherError } from "@/lib/domain/payment-voucher";

// Guest payment (SD-405). The anon role has no table access: both reads and writes go through SECURITY DEFINER RPCs scoped to a
// published property whose subdomain/custom domain equals `host`. get_booking_payment_info answers NULL unless the booking is
// payable right now (pending_payment, hold not run out, no voucher under review), so the payment details are not exposed by
// the token alone beyond that window (H2 of the SD-403 security review).
export async function getPaymentInfo(host: string, token: string): Promise<PaymentInfo | null> {
  if (!PUBLIC_TOKEN_PATTERN.test(token) || !host || host.length > 253) return null;
  const { data, error } = await getSupabaseAnon().rpc("get_booking_payment_info", { p_host: host, p_token: token });
  if (error) {
    log("error", "voucher.info.failed", { code: error.code });
    throw new Error("payment info unavailable");
  }
  if (data === null) return null;
  const parsed = paymentInfoSchema.safeParse(data);
  if (!parsed.success) {
    log("error", "voucher.info.failed", { code: "INVALID_RESPONSE" });
    throw new Error("payment info unavailable");
  }
  return parsed.data;
}

export async function submitVoucher(host: string, input: SubmitVoucherInput): Promise<{ ok: true } | { ok: false; error: VoucherError }> {
  const { error } = await getSupabaseAnon().rpc("submit_payment_voucher", {
    p_host: host, p_token: input.token, p_voucher_path: input.path, p_method: input.method,
    p_reference: input.reference || undefined,
  });
  if (error) {
    log("warn", "voucher.submit.failed", { code: error.code });
    return { ok: false, error: voucherError(error.code) };
  }
  return { ok: true };
}
