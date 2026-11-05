import type { PaymentRow } from "@/lib/dal/bookings";

// Display only: the RPC remains the authority for how much can be collected.
export function remainingBalance(totalCents: number, payments: Pick<PaymentRow, "status" | "amountCents">[]): number {
  return Math.max(0, totalCents - payments.reduce((sum, payment) =>
    sum + (payment.status === "approved" ? payment.amountCents : 0), 0));
}
