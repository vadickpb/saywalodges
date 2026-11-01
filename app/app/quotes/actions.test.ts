import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ preview: vi.fn(), create: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/dal/quotes", () => ({ previewQuote: mocks.preview, createQuote: mocks.create, QUOTES_ERROR: "Error seguro" }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { submitQuoteAction } from "./actions";

const ID = "2c19ef14-e784-4a6b-aafd-82af02488d42";
function form(extra: Record<string, string> = {}) {
  const d = new FormData();
  for (const [k, v] of Object.entries({ unitId: ID, checkIn: "2027-02-01", checkOut: "2027-02-03", guests: "2", lang: "es", ...extra })) d.set(k, v);
  return d;
}
const scenario = { unitId: ID, checkIn: "2027-02-01", checkOut: "2027-02-03", guests: 2 };
const okResult = { unitName: "Casa", available: true, result: { ok: true, quote: { nightsCount: 2, currency: "PEN", totalCents: 30000, depositCents: 15000 } } };
const quote = { checkIn: "2027-02-01", checkOut: "2027-02-03", nightsCount: 2, guests: 2, currency: "PEN", totalCents: 30000, depositCents: 15000 };
const created = { ok: true, token: "t".repeat(64), expiresAt: "2027-01-10T15:00:00.000Z", unitName: "Casa", quote, origin: "https://saywa.test" };

beforeEach(() => {
  vi.clearAllMocks();
  // 2026-11-01 10:00 in Lima: the stays used below (2027) are in the future, and "today" is well defined.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-01T15:00:00.000Z"));
  mocks.preview.mockResolvedValue(okResult);
  mocks.create.mockResolvedValue(created);
});
afterEach(() => vi.useRealTimers());

describe("submitQuoteAction · preview", () => {
  it("forwards only the scenario, ignoring forged amounts/currency/org/deposit", async () => {
    const s = await submitQuoteAction({}, form({ totalCents: "1", currency: "USD", orgId: "x", depositPercent: "100", depositCents: "1" }));
    expect(mocks.preview).toHaveBeenCalledWith(scenario);
    expect(s.preview?.totalCents).toBe(30000);
    expect(s.preview?.depositCents).toBe(15000);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects invalid input without touching the DAL", async () => {
    expect((await submitQuoteAction({}, form({ checkOut: "2027-02-01" }))).error).toBeDefined();
    expect((await submitQuoteAction({}, form({ unitId: "nope" }))).error).toBeDefined();
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("reports unavailable dates, pricing errors, unknown unit and DAL failures safely", async () => {
    mocks.preview.mockResolvedValueOnce({ ...okResult, available: false });
    expect((await submitQuoteAction({}, form())).preview?.available).toBe(false);
    mocks.preview.mockResolvedValueOnce({ ...okResult, result: { ok: false, error: { code: "CAPACITY_EXCEEDED", maxGuests: 4 } } });
    expect((await submitQuoteAction({}, form())).error).toContain("4");
    mocks.preview.mockResolvedValueOnce(null);
    expect((await submitQuoteAction({}, form())).error).toContain("unidad");
    mocks.preview.mockRejectedValueOnce(new Error("pg: secret detail"));
    expect((await submitQuoteAction({}, form())).error).toBe("Error seguro");
  });
});

describe("submitQuoteAction · past dates (Lima)", () => {
  it("rejects a check-in before today in both intents, without touching the DAL", async () => {
    const past = { checkIn: "2026-10-31", checkOut: "2026-11-02" };
    expect((await submitQuoteAction({}, form(past))).error).toContain("anterior a hoy");
    expect((await submitQuoteAction({}, form({ ...past, intent: "create" }))).error).toContain("anterior a hoy");
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("accepts today's date in Lima, even when it is already tomorrow in UTC", async () => {
    vi.setSystemTime(new Date("2026-11-02T03:00:00.000Z")); // 22:00 of 2026-11-01 in Lima
    const s = await submitQuoteAction({}, form({ checkIn: "2026-11-01", checkOut: "2026-11-03" }));
    expect(s.error).toBeUndefined();
    expect(mocks.preview).toHaveBeenCalled();
  });
});

describe("submitQuoteAction · create", () => {
  it("stores the quote, builds the link and message, and refreshes the list", async () => {
    const s = await submitQuoteAction({}, form({ intent: "create", totalCents: "1", depositCents: "1" }));
    expect(mocks.create).toHaveBeenCalledWith(scenario);
    expect(s.created?.link).toBe(`https://saywa.test/es/reservar/${"t".repeat(64)}`);
    expect(s.created?.message).toContain(s.created?.link ?? "?");
    expect(s.created?.message).toContain("Adelanto para reservar");
    expect(s.created?.message).toContain("2027-01-10");
    expect(s.created?.whatsappUrl.startsWith("https://wa.me/?text=")).toBe(true);
    expect(mocks.revalidate).toHaveBeenCalledWith("/app/quotes");
  });
  it("uses the language chosen for the message", async () => {
    const s = await submitQuoteAction({}, form({ intent: "create", lang: "en" }));
    expect(s.created?.link).toContain("/en/reservar/");
    expect(s.created?.message).toContain("Here is your quote");
  });
  it("needs a valid language and scenario before touching the DAL", async () => {
    expect((await submitQuoteAction({}, form({ intent: "create", lang: "fr" }))).error).toBeDefined();
    expect((await submitQuoteAction({}, form({ intent: "create", guests: "0" }))).error).toBeDefined();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("maps every failure to a safe message and never stores or refreshes", async () => {
    mocks.create.mockResolvedValueOnce({ ok: false, reason: "not_found" });
    expect((await submitQuoteAction({}, form({ intent: "create" }))).error).toContain("unidad");
    mocks.create.mockResolvedValueOnce({ ok: false, reason: "unavailable" });
    expect((await submitQuoteAction({}, form({ intent: "create" }))).error).toContain("no están disponibles");
    mocks.create.mockResolvedValueOnce({ ok: false, reason: "pricing", error: { code: "MIN_NIGHTS", requiredNights: 3 } });
    expect((await submitQuoteAction({}, form({ intent: "create" }))).error).toContain("3");
    mocks.create.mockResolvedValueOnce({ ok: false, reason: "no_address" });
    expect((await submitQuoteAction({}, form({ intent: "create" }))).error).toContain("dirección pública");
    mocks.create.mockRejectedValueOnce(new Error("pg: secret detail"));
    expect((await submitQuoteAction({}, form({ intent: "create" }))).error).toBe("Error seguro");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
