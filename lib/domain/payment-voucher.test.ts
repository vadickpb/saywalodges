import { describe, expect, it } from "vitest";
import {
  VOUCHER_MAX_BYTES, buildVoucherPath, checkVoucherFile, paymentInfoSchema, submitVoucherSchema, voucherError, voucherReferenceSchema,
} from "./payment-voucher";

const ORG = "bf88f504-051f-4fdc-ab73-4fa12d715817";
const TOKEN = "c4".repeat(32);
const FILE_ID = "0b8f4c2e-1111-4222-8333-444455556666";

describe("checkVoucherFile", () => {
  it("accepts the four allowed types up to 5 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) {
      expect(checkVoucherFile({ type, size: 1024 })).toBeNull();
    }
    expect(checkVoucherFile({ type: "image/png", size: VOUCHER_MAX_BYTES })).toBeNull();
  });
  it("rejects a missing or empty file, other types, and files over 5 MB", () => {
    expect(checkVoucherFile(null)).toBe("missing");
    expect(checkVoucherFile({ type: "image/png", size: 0 })).toBe("missing");
    expect(checkVoucherFile({ type: "image/gif", size: 10 })).toBe("type");
    expect(checkVoucherFile({ type: "application/x-msdownload", size: 10 })).toBe("type");
    expect(checkVoucherFile({ type: "image/png", size: VOUCHER_MAX_BYTES + 1 })).toBe("size");
  });
});

describe("buildVoucherPath / submitVoucherSchema", () => {
  const prefix = `${ORG}/${TOKEN}/`;
  it("builds the exact shape the upload policy accepts", () => {
    expect(buildVoucherPath(prefix, FILE_ID, "image/jpeg")).toBe(`${ORG}/${TOKEN}/${FILE_ID}.jpg`);
    expect(buildVoucherPath(prefix, FILE_ID, "application/pdf")).toBe(`${ORG}/${TOKEN}/${FILE_ID}.pdf`);
  });
  it("accepts a well-formed submission", () => {
    expect(submitVoucherSchema.safeParse({ token: TOKEN, path: buildVoucherPath(prefix, FILE_ID, "image/png"), method: "yape", reference: "Op 123" }).success).toBe(true);
  });
  it.each([
    ["path traversal", { path: `${ORG}/${TOKEN}/../x.png` }],
    ["a path with another extension", { path: `${ORG}/${TOKEN}/${FILE_ID}.exe` }],
    ["a deeper path", { path: `${ORG}/${TOKEN}/sub/${FILE_ID}.png` }],
    ["a path with no token folder", { path: `${ORG}/${FILE_ID}.png` }],
    ["cash as the method", { method: "cash" }],
    ["mercado_pago as the method", { method: "mercado_pago" }],
    ["a short token", { token: "abc" }],
  ])("rejects %s", (_label, patch) => {
    const ok = { token: TOKEN, path: `${ORG}/${TOKEN}/${FILE_ID}.png`, method: "yape", reference: "" };
    expect(submitVoucherSchema.safeParse({ ...ok, ...patch }).success).toBe(false);
  });
});

describe("voucherReferenceSchema", () => {
  it("trims, allows empty, and refuses control characters and long text", () => {
    expect(voucherReferenceSchema.parse("  Op 12345 ")).toBe("Op 12345");
    expect(voucherReferenceSchema.parse("")).toBe("");
    expect(voucherReferenceSchema.safeParse("a\nb").success).toBe(false);
    expect(voucherReferenceSchema.safeParse("a".repeat(201)).success).toBe(false);
  });
});

describe("paymentInfoSchema", () => {
  const info = { deposit_cents: 30000, currency: "PEN", upload_prefix: `${ORG}/${TOKEN}/`, accounts: [] };
  it("accepts the RPC shape and rejects a malformed prefix", () => {
    expect(paymentInfoSchema.safeParse(info).success).toBe(true);
    expect(paymentInfoSchema.safeParse({ ...info, upload_prefix: "../../" }).success).toBe(false);
    expect(paymentInfoSchema.safeParse({ ...info, deposit_cents: -1 }).success).toBe(false);
  });
});

describe("voucherError", () => {
  it("maps database codes to guest-facing errors and never anything else", () => {
    expect(voucherError("22023")).toBe("validation");
    expect(voucherError("P0002")).toBe("unavailable");
    expect(voucherError("55000")).toBe("expired");
    expect(voucherError("23505")).toBe("alreadyUnderReview");
    expect(voucherError("XX000")).toBe("generic");
    expect(voucherError(undefined)).toBe("generic");
  });
});
