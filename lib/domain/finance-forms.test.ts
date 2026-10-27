import { describe, it, expect } from "vitest";
import {
  MAX_RECEIPT_BYTES,
  buildReceiptPath,
  checkReceipt,
  detectReceiptKind,
  entryFormSchema,
  rentalFormSchema,
} from "./finance-forms";

const CAT = "0bcf73ac-1c1d-4418-9982-2edde9a3e50c";
const UNIT = "ee204001-0000-4000-8000-000000000001";
const ORG = "bf88f504-051f-4fdc-ab73-4fa12d715817";

const expense = { kind: "expense", occurredOn: "2027-03-02", amount: "45.50", currency: "PEN", categoryId: CAT };
const rental = {
  unitId: UNIT, stayStart: "2027-05-01", stayEnd: "2027-05-04", channel: "airbnb", guests: "4",
  occurredOn: "2027-05-04", amount: "1000", currency: "PEN",
};

describe("entryFormSchema", () => {
  it("parses a PEN expense and turns blanks into undefined", () => {
    const r = entryFormSchema.safeParse({ ...expense, unitId: "", paymentMethod: "", counterparty: "  ", note: "", fxRate: "" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.amount).toBe(4550);
    expect(r.data.unitId).toBeUndefined();
    expect(r.data.counterparty).toBeUndefined();
    expect(r.data.fxRate).toBeUndefined();
  });

  it("accepts optional fields when present", () => {
    const r = entryFormSchema.safeParse({ ...expense, unitId: UNIT, paymentMethod: "yape_plin", counterparty: " Sedapal ", note: "marzo" });
    expect(r.success && r.data.paymentMethod).toBe("yape_plin");
    expect(r.success && r.data.counterparty).toBe("Sedapal");
  });

  it("requires a rate for USD and normalises a comma decimal", () => {
    expect(entryFormSchema.safeParse({ ...expense, currency: "USD" }).success).toBe(false);
    const r = entryFormSchema.safeParse({ ...expense, currency: "USD", fxRate: "3,755" });
    expect(r.success && r.data.fxRate).toBe("3.755");
  });

  it("rejects a rate on PEN, out-of-range rates and bad formats", () => {
    expect(entryFormSchema.safeParse({ ...expense, fxRate: "1" }).success).toBe(false);
    for (const fxRate of ["0", "100", "abc", "1.1234567", "-3"]) {
      expect(entryFormSchema.safeParse({ ...expense, currency: "USD", fxRate }).success).toBe(false);
    }
  });

  it("rejects bad amounts, dates, kinds, categories, currencies and methods", () => {
    for (const bad of [
      { amount: "0" }, { amount: "-5" }, { amount: "x" }, { occurredOn: "2027-02-30" }, { occurredOn: "0000-01-01" },
      { occurredOn: "03/02/2027" }, { kind: "transfer" }, { categoryId: "nope" }, { currency: "EUR" },
      { unitId: "nope" }, { paymentMethod: "bitcoin" }, { note: "x".repeat(1001) }, { counterparty: "x".repeat(201) },
    ]) {
      expect(entryFormSchema.safeParse({ ...expense, ...bad }).success).toBe(false);
    }
  });
});

describe("rentalFormSchema", () => {
  it("parses a rental with optional commission and cleaning", () => {
    const r = rentalFormSchema.safeParse({ ...rental, commission: "150", cleaning: "80", guestName: "Ana", paymentMethod: "platform" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({ amount: 100000, commission: 15000, cleaning: 8000, guests: 4, guestName: "Ana" });
  });

  it("leaves blank commission, cleaning, guests and guest name undefined", () => {
    const r = rentalFormSchema.safeParse({ ...rental, guests: "", commission: "", cleaning: "", guestName: "" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.commission).toBeUndefined();
    expect(r.data.guests).toBeUndefined();
  });

  it("requires the stay to end after it starts", () => {
    for (const stayEnd of ["2027-05-01", "2027-04-30"]) {
      const r = rentalFormSchema.safeParse({ ...rental, stayEnd });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues.some((i) => i.path[0] === "stayEnd")).toBe(true);
    }
  });

  it("applies the same currency and rate rules", () => {
    expect(rentalFormSchema.safeParse({ ...rental, currency: "USD" }).success).toBe(false);
    expect(rentalFormSchema.safeParse({ ...rental, currency: "USD", fxRate: "3.75", commission: "10" }).success).toBe(true);
    expect(rentalFormSchema.safeParse({ ...rental, fxRate: "3.75" }).success).toBe(false);
  });

  it("explains a non-numeric guest count in Spanish", () => {
    const r = rentalFormSchema.safeParse({ ...rental, guests: "abc" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.find((i) => i.path[0] === "guests")?.message).toBe("Usa un número entero");
  });

  it("rejects bad units, channels, guest counts and costs", () => {
    for (const bad of [
      { unitId: "" }, { channel: "tripadvisor" }, { guests: "0" }, { guests: "1001" }, { guests: "2.5" }, { guests: "abc" },
      { commission: "0" }, { cleaning: "-3" }, { stayStart: "nope" },
    ]) {
      expect(rentalFormSchema.safeParse({ ...rental, ...bad }).success).toBe(false);
    }
  });
});

describe("detectReceiptKind / checkReceipt", () => {
  const bytes = (...b: number[]) => Uint8Array.from(b);
  const ascii = (text: string) => Uint8Array.from(Buffer.from(text));
  const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0, 0);
  const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0);
  const webp = Uint8Array.from([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]);
  const pdf = ascii("%PDF-1.7\n...");

  it("recognises JPEG, PNG, WebP and PDF by content", () => {
    expect(detectReceiptKind(jpeg)?.ext).toBe("jpg");
    expect(detectReceiptKind(png)?.ext).toBe("png");
    expect(detectReceiptKind(webp)?.ext).toBe("webp");
    expect(detectReceiptKind(pdf)).toEqual({ mime: "application/pdf", ext: "pdf" });
  });

  it("refuses SVG, HTML and truncated headers regardless of the file name", () => {
    expect(detectReceiptKind(ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(detectReceiptKind(ascii("<script>alert(1)</script>"))).toBeNull();
    expect(detectReceiptKind(bytes(0xff, 0xd8))).toBeNull();
    expect(detectReceiptKind(ascii("%PDF"))).toBeNull();
    expect(checkReceipt(ascii("<html></html>")).ok).toBe(false);
  });

  it("rejects empty and oversized files and accepts valid ones", () => {
    expect(checkReceipt(new Uint8Array())).toEqual({ ok: false, error: "El archivo está vacío." });
    const big = new Uint8Array(MAX_RECEIPT_BYTES + 1);
    big.set(pdf);
    expect(checkReceipt(big)).toEqual({ ok: false, error: "El comprobante supera los 4 MB." });
    const ok = checkReceipt(pdf);
    expect(ok.ok && ok.kind.mime).toBe("application/pdf");
  });
});

describe("buildReceiptPath", () => {
  const FILE = "0bcf73ac-1c1d-4418-9982-2edde9a3e50c";
  it("builds an org-prefixed path", () => {
    expect(buildReceiptPath(ORG, FILE, "pdf")).toBe(`${ORG}/receipts/${FILE}.pdf`);
  });
  it("refuses non-uuid segments (no traversal)", () => {
    expect(() => buildReceiptPath("../x", FILE, "jpg")).toThrow();
    expect(() => buildReceiptPath(ORG, "evil/name", "jpg")).toThrow();
  });
});
