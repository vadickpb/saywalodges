import { describe, expect, it } from "vitest";
import { publicQuoteError, publicQuoteRequestSchema, publicQuoteResultSchema, publicQuoteRpcError } from "./public-quote";

const U = "ee204001-0000-4000-8000-000000000001";
const ok = { unitId: U, checkIn: "2040-03-02", checkOut: "2040-03-05", guests: "2", lang: "es" };

describe("publicQuoteRequestSchema", () => {
  it("accepts a valid request and coerces guests from the form text", () => {
    expect(publicQuoteRequestSchema.parse(ok)).toEqual({ ...ok, guests: 2 });
  });
  it("carries no money field: unknown keys such as prices are stripped, not forwarded", () => {
    const parsed = publicQuoteRequestSchema.parse({ ...ok, totalCents: 1, depositCents: 1, price: "0" });
    expect(Object.keys(parsed).sort()).toEqual(["checkIn", "checkOut", "guests", "lang", "unitId"]);
  });
  it.each([
    ["a unit that is not a uuid", { unitId: "'; drop table quotes;--" }],
    ["an impossible date", { checkIn: "2040-02-30" }],
    ["a non-date", { checkOut: "mañana" }],
    ["check-out not after check-in", { checkOut: "2040-03-02" }],
    ["zero guests", { guests: "0" }],
    ["a thousand guests", { guests: "1000" }],
    ["decimal guests", { guests: "1.5" }],
    ["an unknown language", { lang: "fr" }],
  ])("rejects %s", (_label, patch) => {
    expect(publicQuoteRequestSchema.safeParse({ ...ok, ...patch }).success).toBe(false);
  });
});

describe("reading the database's answer", () => {
  it("accepts a success with a 64-hex token and rejects anything else shaped like one", () => {
    const good = { ok: true, token: "a".repeat(64), expires_at: "2040-01-01T00:00:00Z", currency: "USD", total_cents: 100, deposit_cents: 50, nights: 2 };
    expect(publicQuoteResultSchema.safeParse(good).success).toBe(true);
    expect(publicQuoteResultSchema.safeParse({ ...good, token: "../../x" }).success).toBe(false);
  });
  it("maps every business code to something the screen can say, with the numbers it needs", () => {
    expect(publicQuoteError("MIN_NIGHTS", { requiredNights: 3 })).toEqual({ error: "minNights", requiredNights: 3 });
    expect(publicQuoteError("CAPACITY_EXCEEDED", { maxGuests: 6 })).toEqual({ error: "capacity", maxGuests: 6 });
    expect(publicQuoteError("DATES_UNAVAILABLE")).toEqual({ error: "unavailable" });
    expect(publicQuoteError("UNIT_NOT_FOUND")).toEqual({ error: "unitNotFound" });
    expect(publicQuoteError("UNIT_INACTIVE")).toEqual({ error: "unitNotFound" });
    expect(publicQuoteError("INVALID_DATES")).toEqual({ error: "invalidDates" });
    for (const code of ["MISSING_RATE", "AMBIGUOUS_SEASON", "INVALID_CONFIGURATION", "AMOUNT_OVERFLOW"]) expect(publicQuoteError(code)).toEqual({ error: "contact" });
  });
  it("an unknown code is generic and never echoed", () => {
    expect(publicQuoteError("SOMETHING <script>")).toEqual({ error: "generic" });
  });
  it("maps abuse and input errors from the database", () => {
    expect(publicQuoteRpcError("54000")).toEqual({ error: "tryLater" });
    expect(publicQuoteRpcError("22023")).toEqual({ error: "validation" });
    expect(publicQuoteRpcError("22004")).toEqual({ error: "validation" });
    expect(publicQuoteRpcError("XX000")).toEqual({ error: "generic" });
    expect(publicQuoteRpcError(undefined)).toEqual({ error: "generic" });
  });
});
