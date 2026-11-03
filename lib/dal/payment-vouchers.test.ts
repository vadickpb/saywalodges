import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { getVoucherSignedUrl, VOUCHER_URL_TTL_SECONDS } from "./payment-vouchers";

const ORG = "bf88f504-051f-4fdc-ab73-4fa12d715817";
const OTHER = "ff24bacc-47d2-40bc-9210-f860e98892fd";

function client(row: { data: { voucher_path: string | null } | null; error: { code: string } | null }, sign = { data: { signedUrl: "https://x/signed" }, error: null as unknown }) {
  const createSignedUrl = vi.fn().mockResolvedValue(sign);
  const eq2 = vi.fn().mockReturnValue({ maybeSingle: () => Promise.resolve(row) });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const supabase = { from: () => ({ select: () => ({ eq: eq1 }) }), storage: { from: () => ({ createSignedUrl }) } };
  return { supabase: supabase as never, createSignedUrl, eq1, eq2 };
}

describe("getVoucherSignedUrl", () => {
  it("signs the organization's own file for one minute and scopes the read to the org", async () => {
    const c = client({ data: { voucher_path: `${ORG}/${"c4".repeat(32)}/id.png` }, error: null });
    expect(await getVoucherSignedUrl(c.supabase, ORG, "pay-1")).toBe("https://x/signed");
    expect(c.createSignedUrl).toHaveBeenCalledWith(`${ORG}/${"c4".repeat(32)}/id.png`, VOUCHER_URL_TTL_SECONDS);
    expect(VOUCHER_URL_TTL_SECONDS).toBeLessThanOrEqual(60);
    expect(c.eq2).toHaveBeenCalledWith("org_id", ORG);
  });
  it("returns null, signing nothing, when the payment is not visible or has no file", async () => {
    for (const data of [null, { voucher_path: null }]) {
      const c = client({ data, error: null });
      expect(await getVoucherSignedUrl(c.supabase, ORG, "pay-1")).toBeNull();
      expect(c.createSignedUrl).not.toHaveBeenCalled();
    }
  });
  it("refuses a path that is not in the organization's folder", async () => {
    const c = client({ data: { voucher_path: `${OTHER}/${"c4".repeat(32)}/id.png` }, error: null });
    expect(await getVoucherSignedUrl(c.supabase, ORG, "pay-1")).toBeNull();
    expect(c.createSignedUrl).not.toHaveBeenCalled();
  });
  it("fails with a generic message (no database text) when reading or signing fails", async () => {
    const read = client({ data: null, error: { code: "XX000" } });
    await expect(getVoucherSignedUrl(read.supabase, ORG, "p")).rejects.toThrow("No se pudo cargar el comprobante.");
    const sign = client({ data: { voucher_path: `${ORG}/t/id.png` }, error: null }, { data: null as never, error: { message: "secret detail" } });
    await expect(getVoucherSignedUrl(sign.supabase, ORG, "p")).rejects.toThrow("No se pudo cargar el comprobante.");
  });
});
