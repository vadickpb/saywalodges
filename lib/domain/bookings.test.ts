import { describe, expect, it } from "vitest";
import {
  approvePaymentSchema, bookingActionError, bookingStateLabel, cancelBookingSchema, canCancel, canReview, parseBookingQuery, rejectPaymentSchema,
} from "./bookings";

const ID = "b2050000-0000-4000-8000-000000000001";

describe("parseBookingQuery", () => {
  it("defaults when nothing (or garbage) is given", () => {
    expect(parseBookingQuery({})).toEqual({ filter: "all", from: null, to: null, page: 1 });
    expect(parseBookingQuery({ estado: "hacked", desde: "ayer", hasta: "2026-13-45", pagina: "-3" })).toEqual({ filter: "all", from: null, to: null, page: 1 });
  });
  it("accepts valid values and takes the first of a repeated parameter", () => {
    expect(parseBookingQuery({ estado: "confirmed", desde: "2026-11-01", hasta: "2026-12-31", pagina: "3" })).toEqual({ filter: "confirmed", from: "2026-11-01", to: "2026-12-31", page: 3 });
    expect(parseBookingQuery({ estado: ["cancelled", "confirmed"] }).filter).toBe("cancelled");
  });
  it("rejects impossible dates and huge pages", () => {
    expect(parseBookingQuery({ desde: "2026-02-30" }).from).toBeNull();
    expect(parseBookingQuery({ pagina: "99999999" }).page).toBe(1);
  });
});

describe("states and allowed actions", () => {
  it("labels a pending booking with a voucher as the owner's to-do", () => {
    expect(bookingStateLabel("pending_payment", true)).toEqual({ label: "Comprobante por revisar", tone: "action" });
    expect(bookingStateLabel("pending_payment", false).label).toBe("Esperando pago");
    expect(bookingStateLabel("confirmed", false).tone).toBe("ok");
  });
  it("only pending or confirmed bookings can be cancelled, and only a pending voucher of a pending booking reviewed", () => {
    expect(canCancel("pending_payment")).toBe(true);
    expect(canCancel("confirmed")).toBe(true);
    expect(canCancel("cancelled")).toBe(false);
    expect(canCancel("expired")).toBe(false);
    expect(canReview("pending_payment", "pending_review")).toBe(true);
    expect(canReview("pending_payment", "approved")).toBe(false);
    expect(canReview("confirmed", "pending_review")).toBe(false);
  });
});

describe("action input schemas", () => {
  it("approve: optional exchange rate with sane bounds", () => {
    expect(approvePaymentSchema.parse({ paymentId: ID, fxRate: "" })).toEqual({ paymentId: ID, fxRate: null });
    expect(approvePaymentSchema.parse({ paymentId: ID, fxRate: "3.7512" })).toEqual({ paymentId: ID, fxRate: 3.7512 });
    for (const bad of ["0", "-3", "3,7", "abc", "1001", "3.75123", "1e3"]) {
      expect(approvePaymentSchema.safeParse({ paymentId: ID, fxRate: bad }).success, bad).toBe(false);
    }
    expect(approvePaymentSchema.safeParse({ paymentId: "nope", fxRate: "" }).success).toBe(false);
  });
  it("reject/cancel: optional trimmed reason, no control or bidi characters, max 500", () => {
    expect(rejectPaymentSchema.parse({ paymentId: ID, reason: "  borroso " }).reason).toBe("borroso");
    expect(cancelBookingSchema.parse({ bookingId: ID, reason: "" }).reason).toBe("");
    expect(rejectPaymentSchema.safeParse({ paymentId: ID, reason: "a\nb" }).success).toBe(false);
    expect(rejectPaymentSchema.safeParse({ paymentId: ID, reason: "x‮y" }).success).toBe(false);
    expect(cancelBookingSchema.safeParse({ bookingId: ID, reason: "a".repeat(501) }).success).toBe(false);
  });
});

describe("bookingActionError", () => {
  it("maps known codes and never anything else", () => {
    expect(bookingActionError("approve", "22023")).toMatch(/tipo de cambio/);
    expect(bookingActionError("cancel", "22023")).toMatch(/motivo/);
    expect(bookingActionError("approve", "55000")).toMatch(/cambió de estado/);
    expect(bookingActionError("reject", "42501")).toMatch(/permiso/);
    expect(bookingActionError("reject", "XX000")).toMatch(/No se pudo/);
    expect(bookingActionError("reject", undefined)).toMatch(/No se pudo/);
  });
});
