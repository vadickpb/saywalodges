import { z } from "zod";

export const VOUCHER_PURGE_LIMIT = 100;
export const VOUCHER_ORPHAN_HOURS = 24;
export const VOUCHER_CLOSED_DAYS = 30;
// Proposal for the owner, NOT an enabled deletion policy or a statutory retention period.
export const VOUCHER_APPROVED_RETENTION_YEARS = 5;

const timestamp = z.string().refine((value) => Number.isFinite(Date.parse(value)));
export const purgeVoucherSchema = z.object({
  id: z.uuid(),
  path: z.string().min(1),
  created_at: timestamp,
  org_exists: z.boolean(),
  payment_status: z.enum(["approved", "pending_review", "rejected"]).nullable(),
  reviewed_at: timestamp.nullable(),
  booking_status: z.enum(["pending_payment", "confirmed", "expired", "cancelled"]).nullable(),
  booking_updated_at: timestamp.nullable(),
});
export type PurgeVoucher = z.infer<typeof purgeVoucherSchema>;

/** Protection takes precedence over every retention rule, even for deleted organizations. */
export function selectVoucherPurge(objects: readonly PurgeVoucher[], now: number): PurgeVoucher[] {
  const olderThan = (value: string | null, age: number) =>
    value !== null && Date.parse(value) < now - age;
  const day = 24 * 60 * 60 * 1000;
  return objects.filter((object) => {
    if (object.payment_status === "approved" || object.payment_status === "pending_review") return false;
    if (!olderThan(object.created_at, VOUCHER_ORPHAN_HOURS * 60 * 60 * 1000)) return false;
    if (!object.org_exists || object.payment_status === null) return true;
    return (object.payment_status === "rejected" && olderThan(object.reviewed_at, VOUCHER_CLOSED_DAYS * day))
      || ((object.booking_status === "expired" || object.booking_status === "cancelled")
        && olderThan(object.booking_updated_at, VOUCHER_CLOSED_DAYS * day));
  }).slice(0, VOUCHER_PURGE_LIMIT);
}
