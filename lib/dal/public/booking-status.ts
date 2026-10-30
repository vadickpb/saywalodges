import "server-only";
import { getSupabaseAnon } from "@/lib/supabase/anon";
import { bookingStatusSchema, PUBLIC_TOKEN_PATTERN, type BookingStatusSnapshot } from "@/lib/domain/booking-status";

// Public booking status (SD-408). The anon role has no table access to bookings (ADR 0002):
// the only read path is the get_booking_status RPC, which is scoped to a published property
// whose subdomain/custom domain equals `host`, and returns no PII. A malformed token, an
// unknown token, a token of another tenant and an unpublished property all give null.
// Real failures throw, so the caller can tell an outage from "not found" in the logs.
export async function getBookingStatus(host: string, token: string): Promise<BookingStatusSnapshot | null> {
  if (!PUBLIC_TOKEN_PATTERN.test(token) || host.length === 0 || host.length > 253) return null;
  const { data, error } = await getSupabaseAnon().rpc("get_booking_status", { p_host: host, p_token: token });
  if (error) {
    console.error("getBookingStatus: rpc failed:", error.code);
    throw new Error("booking status lookup failed");
  }
  if (data === null) return null;
  const parsed = bookingStatusSchema.safeParse(data);
  if (!parsed.success) {
    console.error("getBookingStatus: unexpected rpc shape");
    throw new Error("booking status lookup failed");
  }
  return parsed.data;
}
