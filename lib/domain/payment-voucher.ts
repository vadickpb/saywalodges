import { z } from "zod";
import { PUBLIC_TOKEN_PATTERN } from "@/lib/domain/booking-status";

// Manual payment voucher (SD-405). Pure: validation and shapes shared by the page, the server action and the browser
// uploader. The database re-checks everything that matters (path ownership, payable window, amount); this only gives the
// guest early, readable errors.

export const VOUCHER_BUCKET = "payment-vouchers";
export const VOUCHER_MAX_BYTES = 5 * 1024 * 1024;
// MIME type → the only extensions the upload policy accepts.
export const VOUCHER_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" } as const;
export type VoucherMime = keyof typeof VOUCHER_TYPES;

export const voucherMethodSchema = z.enum(["yape", "plin", "bank_transfer"]);
export type VoucherMethod = z.infer<typeof voucherMethodSchema>;

// Optional operation number. Control characters are refused (the database refuses them too).
export const voucherReferenceSchema = z
  .string()
  .trim()
  .max(200)
  .refine((v) => !/[\u0000-\u001f\u007f-\u009f]/.test(v));

export type VoucherFileProblem = "missing" | "type" | "size";
export function checkVoucherFile(file: { type: string; size: number } | null): VoucherFileProblem | null {
  if (!file || file.size === 0) return "missing";
  if (!(file.type in VOUCHER_TYPES)) return "type";
  if (file.size > VOUCHER_MAX_BYTES) return "size";
  return null;
}

/** `<org_id>/<public_token>/<uuid>.<ext>`, built from the prefix the database returns. */
export function buildVoucherPath(prefix: string, id: string, mime: VoucherMime): string {
  return `${prefix}${id}.${VOUCHER_TYPES[mime]}`;
}

export const voucherPathSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-f0-9]{64}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/);

export const submitVoucherSchema = z.object({
  token: z.string().regex(PUBLIC_TOKEN_PATTERN),
  path: voucherPathSchema,
  method: voucherMethodSchema,
  reference: voucherReferenceSchema,
});
export type SubmitVoucherInput = z.infer<typeof submitVoucherSchema>;

const account = z.object({
  kind: z.enum(["yape", "plin", "bank_account"]),
  holder_name: z.string(),
  phone: z.string().nullable(),
  bank_name: z.string().nullable(),
  account_number: z.string().nullable(),
  cci: z.string().nullable(),
  instructions: z.string().nullable(),
});
export const paymentInfoSchema = z.object({
  deposit_cents: z.number().int().nonnegative(),
  currency: z.enum(["PEN", "USD"]),
  upload_prefix: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-f0-9]{64}\/$/),
  accounts: z.array(account),
});
export type PaymentInfo = z.infer<typeof paymentInfoSchema>;

export type VoucherError = "validation" | "unavailable" | "expired" | "alreadyUnderReview" | "generic";
export type VoucherState = { error?: VoucherError };

/** Maps a database error code to what the guest can act on. Never exposes the database message. */
export function voucherError(code: string | undefined): VoucherError {
  switch (code) {
    case "22023": return "validation";
    case "P0002": return "unavailable";
    case "55000": return "expired";
    case "23505": return "alreadyUnderReview";
    default: return "generic";
  }
}
