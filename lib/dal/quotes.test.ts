import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ ctx: vi.fn(), pricing: vi.fn(), from: vi.fn(), rpc: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/dal/calendar", () => ({ getCalendarContext: mocks.ctx }));
vi.mock("@/lib/dal/rates", () => ({ getPricingData: mocks.pricing }));
vi.mock("@/lib/env", () => ({ env: { ROOT_DOMAIN: "saywa.test" } }));
vi.mock("@/lib/log", () => ({ log: mocks.log }));
import { createQuote, listOpenQuotes, previewQuote, QUOTES_ERROR } from "./quotes";

const ID = "2c19ef14-e784-4a6b-aafd-82af02488d42";
const TOKEN = "a".repeat(64);
const input = { unitId: ID, checkIn: "2027-02-01", checkOut: "2027-02-03", guests: 2 };

// Every call made on a query builder: [table, method, args]. Tests assert on the filters, not only on the data.
let calls: [string, string, unknown[]][] = [];

// A query builder whose every step returns itself, records the call, and resolves to `result` when awaited.
function builder(table: string, result: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gt", "in", "order", "overlaps", "or", "limit", "single"]) {
    b[m] = (...args: unknown[]) => {
      calls.push([table, m, args]);
      return b;
    };
  }
  b.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return b;
}
const called = (table: string, method: string, ...args: unknown[]) =>
  calls.some(([t, m, a]) => t === table && m === method && args.every((x, i) => a[i] === x));

const pricing = {
  currency: "PEN",
  units: [{ id: ID, name: "Casa", active: true, maxGuests: 4, includedGuests: 2 }],
  seasons: [],
  rates: [{ id: "r1", unitId: ID, seasonId: null, nightlyCents: 10000, weekendNightlyCents: null, extraGuestCents: 0, minNights: 1 }],
  fees: [{ id: "f1", unitId: ID, name: "Cleaning", kind: "per_stay", amountCents: 5000 }],
};
let tables: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  tables = {
    properties: { data: { deposit_percent: 50, subdomain: "casa", custom_domain: null }, error: null },
    calendar_blocks: { data: [], error: null },
  };
  mocks.ctx.mockResolvedValue({ supabase: { from: mocks.from, rpc: mocks.rpc }, orgId: "org-1", propertyId: "prop-1" });
  mocks.pricing.mockResolvedValue(pricing);
  mocks.from.mockImplementation((table: string) => builder(table, tables[table]));
  mocks.rpc.mockResolvedValue({ data: { quote_id: ID, token: TOKEN, expires_at: "2027-01-10T15:00:00.000Z" }, error: null });
});

describe("createQuote", () => {
  it("sends the server-computed amounts to create_quote, with no currency parameter", async () => {
    const r = await createQuote(input);
    expect(r).toMatchObject({ ok: true, token: TOKEN, unitName: "Casa", origin: "https://casa.saywa.test" });
    const [name, args] = mocks.rpc.mock.calls[0];
    expect(name).toBe("create_quote");
    expect(args).toMatchObject({
      p_org_id: "org-1", p_unit_id: ID, p_check_in: "2027-02-01", p_check_out: "2027-02-03", p_guests: 2,
      p_total_cents: 25000, p_deposit_cents: 12500, p_valid_hours: 72,
    });
    expect(args.p_breakdown).toMatchObject({ accommodationCents: 20000, feesCents: 5000, totalCents: 25000, depositPercent: 50 });
    expect(Object.keys(args)).not.toContain("p_currency");
  });
  it("scopes every read to the verified org, property and unit, and ignores expired holds", async () => {
    await createQuote(input);
    expect(called("properties", "eq", "org_id", "org-1")).toBe(true);
    expect(called("properties", "eq", "id", "prop-1")).toBe(true);
    expect(called("calendar_blocks", "eq", "org_id", "org-1")).toBe(true);
    expect(called("calendar_blocks", "eq", "property_id", "prop-1")).toBe(true);
    expect(called("calendar_blocks", "eq", "unit_id", ID)).toBe(true);
    expect(called("calendar_blocks", "overlaps", "period", "[2027-02-01,2027-02-03)")).toBe(true);
    const or = calls.find(([t, m]) => t === "calendar_blocks" && m === "or");
    expect(String(or?.[2][0])).toMatch(/^expires_at\.is\.null,expires_at\.gt\.\d{4}-\d{2}-\d{2}T/);
  });
  it("does not store anything when the property has no public address", async () => {
    tables.properties = { data: { deposit_percent: 50, subdomain: " ", custom_domain: null }, error: null };
    expect(await createQuote(input)).toEqual({ ok: false, reason: "no_address" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("takes the deposit from the property policy", async () => {
    tables.properties = { data: { deposit_percent: 30, subdomain: "casa", custom_domain: null }, error: null };
    await createQuote(input);
    const [, args] = mocks.rpc.mock.calls[0];
    expect(args.p_deposit_cents).toBe(7500);
    expect(args.p_breakdown.depositPercent).toBe(30);
  });
  it("uses the custom domain for the link origin", async () => {
    tables.properties = { data: { deposit_percent: 50, subdomain: "casa", custom_domain: "casa.pe" }, error: null };
    expect(await createQuote(input)).toMatchObject({ ok: true, origin: "https://casa.pe" });
  });
  it("does not store anything when the dates are taken", async () => {
    tables.calendar_blocks = { data: [{ id: "b1" }], error: null };
    expect(await createQuote(input)).toEqual({ ok: false, reason: "unavailable" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not store anything for an unknown unit or without an active org", async () => {
    expect(await createQuote({ ...input, unitId: "other" })).toEqual({ ok: false, reason: "not_found" });
    mocks.ctx.mockResolvedValueOnce(null);
    expect(await createQuote(input)).toEqual({ ok: false, reason: "not_found" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not store anything when the engine rejects the scenario", async () => {
    const r = await createQuote({ ...input, guests: 9 });
    expect(r).toMatchObject({ ok: false, reason: "pricing", error: { code: "CAPACITY_EXCEEDED", maxGuests: 4 } });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("throws a generic error and logs only the code when the RPC fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied for table quotes" } });
    await expect(createQuote(input)).rejects.toThrow(QUOTES_ERROR);
    expect(mocks.log).toHaveBeenCalledWith("error", "quotes.create.rpc_failed", { code: "42501" });
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain("permission denied");
  });
  it("rejects a malformed RPC result", async () => {
    mocks.rpc.mockResolvedValue({ data: { quote_id: ID, token: "short", expires_at: "x" }, error: null });
    await expect(createQuote(input)).rejects.toThrow(QUOTES_ERROR);
  });
  it("fails closed when the property policy cannot be read", async () => {
    tables.properties = { data: null, error: { code: "PGRST116", message: "boom" } };
    await expect(createQuote(input)).rejects.toThrow(QUOTES_ERROR);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("fails closed when availability cannot be read", async () => {
    tables.calendar_blocks = { data: null, error: { code: "XX000", message: "boom" } };
    await expect(createQuote(input)).rejects.toThrow(QUOTES_ERROR);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("previewQuote", () => {
  it("never writes", async () => {
    const r = await previewQuote(input);
    expect(r).toMatchObject({ unitName: "Casa", available: true });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("reports unavailable dates", async () => {
    tables.calendar_blocks = { data: [{ id: "b1" }], error: null };
    expect(await previewQuote(input)).toMatchObject({ available: false });
  });
  it("returns null for an unknown unit", async () => {
    expect(await previewQuote({ ...input, unitId: "other" })).toBeNull();
  });
});

describe("listOpenQuotes", () => {
  const row = (id: string) => ({ id, token: TOKEN, unit_id: ID, check_in: "2027-02-01", check_out: "2027-02-03", guests: 2, currency: "PEN", total_cents: 25000, expires_at: "2027-01-10T15:00:00.000Z" });
  it("hides quotes that already became a booking and returns the link origin", async () => {
    tables.quotes = { data: [row("q1"), row("q2")], error: null };
    tables.bookings = { data: [{ quote_id: "q1" }], error: null };
    tables.units = { data: [{ id: ID, name: "Casa" }], error: null };
    const r = await listOpenQuotes();
    expect(r.origin).toBe("https://casa.saywa.test");
    expect(r.quotes.map((q) => q.id)).toEqual(["q2"]);
    expect(r.quotes[0]).toMatchObject({ unitName: "Casa", totalCents: 25000 });
    expect(called("quotes", "eq", "org_id", "org-1")).toBe(true);
    expect(called("bookings", "eq", "org_id", "org-1")).toBe(true);
    expect(called("units", "eq", "org_id", "org-1")).toBe(true);
    expect(calls.some(([t, m, a]) => t === "quotes" && m === "gt" && a[0] === "expires_at")).toBe(true);
  });
  it("is empty without an active org", async () => {
    mocks.ctx.mockResolvedValueOnce(null);
    expect(await listOpenQuotes()).toEqual({ quotes: [], origin: null });
  });
  it("throws a generic error when a read fails", async () => {
    tables.quotes = { data: null, error: { code: "42501", message: "secret" } };
    await expect(listOpenQuotes()).rejects.toThrow(QUOTES_ERROR);
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain("secret");
  });
});
