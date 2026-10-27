import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// redirect() never returns in Next; model that with a throw we can assert on.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/dal/finance", () => ({
  createEntry: vi.fn(),
  createRental: vi.fn(),
  deleteEntry: vi.fn(),
  removeReceipt: vi.fn(),
  updateEntry: vi.fn(),
  uploadReceipt: vi.fn(),
}));
vi.mock("./_lib/context", () => ({
  getFinanceContext: vi.fn(),
  GENERIC_ERROR: "generic",
  NO_CONTEXT_ERROR: "no-context",
}));

import * as dal from "@/lib/dal/finance";
import { getFinanceContext } from "./_lib/context";
import { createEntryAction, createRentalAction, deleteEntryAction, updateEntryAction } from "./actions";

const ORG = "bf88f504-051f-4fdc-ab73-4fa12d715817";
const CAT = "0bcf73ac-1c1d-4418-9982-2edde9a3e50c";
const UNIT = "ee204001-0000-4000-8000-000000000001";
const ID = "7fc45683-5cf1-4bac-8dde-3331b397956c";
const supabase = {};

function fd(fields: Record<string, string>, file?: File) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  if (file) data.set("receipt", file);
  return data;
}
const expenseFields = { kind: "expense", occurredOn: "2027-03-02", amount: "45.50", currency: "PEN", categoryId: CAT, counterparty: "Sedapal" };
const rentalFields = {
  unitId: UNIT, stayStart: "2027-05-01", stayEnd: "2027-05-04", channel: "airbnb", guests: "4", occurredOn: "2027-05-04",
  amount: "1000", currency: "PEN", commission: "150", cleaning: "80",
};
const pdf = () => new File(["%PDF-1.4 hello"], "factura.pdf", { type: "application/pdf" });
const prev = { ok: false };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getFinanceContext).mockResolvedValue({ supabase, orgId: ORG, role: "owner", isOwner: true } as never);
  vi.mocked(dal.uploadReceipt).mockResolvedValue(true);
  vi.mocked(dal.removeReceipt).mockResolvedValue(true);
  vi.mocked(dal.createEntry).mockResolvedValue({ ok: true, id: "new" });
  vi.mocked(dal.createRental).mockResolvedValue({ ok: true, id: "new" });
  vi.mocked(dal.updateEntry).mockResolvedValue({ ok: true });
  vi.mocked(dal.deleteEntry).mockResolvedValue({ ok: true });
});

describe("createEntryAction", () => {
  it("saves and redirects to the entry's month", async () => {
    await expect(createEntryAction(prev, fd(expenseFields))).rejects.toThrow("REDIRECT:/app/finance?month=2027-03");
    expect(dal.createEntry).toHaveBeenCalledWith(supabase, ORG, expect.objectContaining({ amount: 4550, kind: "expense", counterparty: "Sedapal" }), undefined);
    expect(dal.uploadReceipt).not.toHaveBeenCalled();
  });

  it("refuses an SVG or HTML disguised as an image, before anything is uploaded or saved", async () => {
    for (const body of ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "<html><script>alert(1)</script></html>"]) {
      const disguised = new File([body], "recibo.png", { type: "image/png" });
      const r = await createEntryAction(prev, fd(expenseFields, disguised));
      expect(r.ok).toBe(false);
      expect(r.errors?.receipt?.[0]).toMatch(/Formato no admitido/);
      expect(r.values?.counterparty).toBe("Sedapal");
    }
    expect(dal.uploadReceipt).not.toHaveBeenCalled();
    expect(dal.createEntry).not.toHaveBeenCalled();
  });

  it("refuses an oversized receipt", async () => {
    const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "grande.pdf", { type: "application/pdf" });
    const r = await createEntryAction(prev, fd(expenseFields, big));
    expect(r.errors?.receipt?.[0]).toMatch(/4 MB/);
    expect(dal.uploadReceipt).not.toHaveBeenCalled();
  });

  it("uploads a valid PDF under the org prefix and passes the path to the row", async () => {
    await expect(createEntryAction(prev, fd(expenseFields, pdf()))).rejects.toThrow("REDIRECT:");
    const [, path, bytes, mime] = vi.mocked(dal.uploadReceipt).mock.calls[0];
    expect(path).toMatch(new RegExp(`^${ORG}/receipts/[0-9a-f-]{36}\\.pdf$`));
    expect(mime).toBe("application/pdf");
    expect(Array.from((bytes as Uint8Array).slice(0, 5))).toEqual(Array.from(Buffer.from("%PDF-")));
    expect(dal.createEntry).toHaveBeenCalledWith(supabase, ORG, expect.anything(), path);
  });

  it("accepts the camera photo input as the receipt and prefers an explicitly chosen file", async () => {
    const data = fd(expenseFields);
    data.set("receiptPhoto", new File(["%PDF-1.4 photo"], "foto.pdf", { type: "application/pdf" }));
    await expect(createEntryAction(prev, data)).rejects.toThrow("REDIRECT:");
    expect(dal.uploadReceipt).toHaveBeenCalledTimes(1);

    vi.mocked(dal.uploadReceipt).mockClear();
    const both = fd(expenseFields, new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x4a, 0x46])], "a.jpg", { type: "image/jpeg" }));
    both.set("receiptPhoto", pdf());
    await expect(createEntryAction(prev, both)).rejects.toThrow("REDIRECT:");
    expect(vi.mocked(dal.uploadReceipt).mock.calls[0][1]).toMatch(/\.jpg$/); // the chosen file wins over the photo input
  });

  it("removes the uploaded object again when saving the row fails", async () => {
    vi.mocked(dal.createEntry).mockResolvedValue({ ok: false });
    const r = await createEntryAction(prev, fd(expenseFields, pdf()));
    expect(r).toMatchObject({ ok: false, formError: "generic" });
    const uploadedPath = vi.mocked(dal.uploadReceipt).mock.calls[0][1];
    expect(dal.removeReceipt).toHaveBeenCalledWith(supabase, uploadedPath);
  });

  it("does not save when the upload fails", async () => {
    vi.mocked(dal.uploadReceipt).mockResolvedValue(false);
    const r = await createEntryAction(prev, fd(expenseFields, pdf()));
    expect(r).toMatchObject({ ok: false, formError: "generic" });
    expect(dal.createEntry).not.toHaveBeenCalled();
    expect(dal.removeReceipt).not.toHaveBeenCalled();
  });

  it("returns field errors and the typed values, uploading nothing, for invalid input", async () => {
    const r = await createEntryAction(prev, fd({ ...expenseFields, amount: "0" }, pdf()));
    expect(r.errors?.amount).toBeDefined();
    expect(r.values?.amount).toBe("0");
    expect(dal.uploadReceipt).not.toHaveBeenCalled();
  });

  it("reports a missing organization", async () => {
    vi.mocked(getFinanceContext).mockResolvedValue(null);
    expect(await createEntryAction(prev, fd(expenseFields))).toMatchObject({ ok: false, formError: "no-context" });
  });
});

describe("createRentalAction", () => {
  it("passes the cleaning cost only when its checkbox is ticked", async () => {
    await expect(createRentalAction(prev, fd(rentalFields))).rejects.toThrow("REDIRECT:/app/finance?month=2027-05");
    expect(vi.mocked(dal.createRental).mock.calls[0][0]).toBe(supabase);
    expect(vi.mocked(dal.createRental).mock.calls[0][1]).toBe(ORG); // the session org, never a form field
    expect(vi.mocked(dal.createRental).mock.calls[0][2]).toMatchObject({ commission: 15000, cleaning: undefined });

    vi.mocked(dal.createRental).mockClear();
    const ticked = fd(rentalFields);
    ticked.set("addCleaning", "on");
    await expect(createRentalAction(prev, ticked)).rejects.toThrow("REDIRECT:");
    expect(vi.mocked(dal.createRental).mock.calls[0][2]).toMatchObject({ commission: 15000, cleaning: 8000 });
  });

  it("validates the stay and cleans up the receipt when the atomic call fails", async () => {
    const bad = await createRentalAction(prev, fd({ ...rentalFields, stayEnd: "2027-05-01" }));
    expect(bad.errors?.stayEnd).toBeDefined();
    vi.mocked(dal.createRental).mockResolvedValue({ ok: false });
    const r = await createRentalAction(prev, fd(rentalFields, pdf()));
    expect(r).toMatchObject({ ok: false, formError: "generic" });
    expect(dal.removeReceipt).toHaveBeenCalledTimes(1);
  });

  it("refuses a disguised file and a missing organization", async () => {
    const r = await createRentalAction(prev, fd(rentalFields, new File(["<svg/>"], "x.jpg", { type: "image/jpeg" })));
    expect(r.errors?.receipt).toBeDefined();
    expect(dal.createRental).not.toHaveBeenCalled();
    vi.mocked(getFinanceContext).mockResolvedValue(null);
    expect(await createRentalAction(prev, fd(rentalFields))).toMatchObject({ formError: "no-context" });
  });

  it("does not save when the receipt upload fails", async () => {
    vi.mocked(dal.uploadReceipt).mockResolvedValue(false);
    expect(await createRentalAction(prev, fd(rentalFields, pdf()))).toMatchObject({ formError: "generic" });
    expect(dal.createRental).not.toHaveBeenCalled();
  });
});

describe("updateEntryAction", () => {
  it("rejects a malformed id", async () => {
    expect(await updateEntryAction(prev, fd({ ...expenseFields, id: "not-a-uuid" }))).toMatchObject({ ok: false, formError: "generic" });
    expect(dal.updateEntry).not.toHaveBeenCalled();
  });

  it("updates, replacing the receipt only when a file is sent", async () => {
    await expect(updateEntryAction(prev, fd({ ...expenseFields, id: ID }))).rejects.toThrow("REDIRECT:/app/finance?month=2027-03");
    expect(dal.updateEntry).toHaveBeenCalledWith(supabase, ORG, ID, expect.anything(), undefined);
    vi.mocked(dal.updateEntry).mockClear();
    await expect(updateEntryAction(prev, fd({ ...expenseFields, id: ID }, pdf()))).rejects.toThrow("REDIRECT:");
    expect(vi.mocked(dal.updateEntry).mock.calls[0][4]).toMatch(/\.pdf$/);
  });

  it("removes the new object when the update fails, and rejects bad input and files", async () => {
    vi.mocked(dal.updateEntry).mockResolvedValue({ ok: false });
    expect(await updateEntryAction(prev, fd({ ...expenseFields, id: ID }, pdf()))).toMatchObject({ formError: "generic" });
    expect(dal.removeReceipt).toHaveBeenCalledTimes(1);
    expect((await updateEntryAction(prev, fd({ ...expenseFields, id: ID, amount: "x" }))).errors?.amount).toBeDefined();
    const disguised = new File(["<html/>"], "x.png", { type: "image/png" });
    expect((await updateEntryAction(prev, fd({ ...expenseFields, id: ID }, disguised))).errors?.receipt).toBeDefined();
    vi.mocked(dal.uploadReceipt).mockResolvedValue(false);
    expect(await updateEntryAction(prev, fd({ ...expenseFields, id: ID }, pdf()))).toMatchObject({ formError: "generic" });
    vi.mocked(getFinanceContext).mockResolvedValue(null);
    expect(await updateEntryAction(prev, fd({ ...expenseFields, id: ID }))).toMatchObject({ formError: "no-context" });
  });
});

describe("deleteEntryAction", () => {
  it("deletes by id and reports generic failures", async () => {
    expect(await deleteEntryAction(fd({ id: ID }))).toEqual({ ok: true });
    expect(dal.deleteEntry).toHaveBeenCalledWith(supabase, ORG, ID);
    expect(await deleteEntryAction(fd({ id: "nope" }))).toEqual({ ok: false, error: "generic" });
    vi.mocked(dal.deleteEntry).mockResolvedValue({ ok: false });
    expect(await deleteEntryAction(fd({ id: ID }))).toEqual({ ok: false, error: "generic" });
    vi.mocked(getFinanceContext).mockResolvedValue(null);
    expect(await deleteEntryAction(fd({ id: ID }))).toEqual({ ok: false, error: "no-context" });
  });
});
