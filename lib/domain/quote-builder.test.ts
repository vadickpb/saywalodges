import { describe, expect, it } from "vitest";
import { quoteStay } from "./pricing";
import {
  buildQuoteMessage,
  createQuoteRequestSchema,
  limaDate,
  quoteLinkUrl,
  quoteRequestSchema,
  siteOrigin,
  toQuoteBreakdown,
  whatsappShareUrl,
} from "./quote-builder";

const ID = "2c19ef14-e784-4a6b-aafd-82af02488d42";
const base = { lang: "es" as const, unitName: "Casa", checkIn: "2027-02-01", checkOut: "2027-02-03", nights: 2, guests: 1, totalLabel: "S/ 300.00", expiresOn: "2027-01-10", link: "https://x.test/es/reservar/tok" };
const valid = { unitId: ID, checkIn: "2027-02-01", checkOut: "2027-02-03", guests: 2 };

describe("quoteRequestSchema", () => {
  it("accepts a valid request and strips money fields a client might forge", () => {
    const parsed = quoteRequestSchema.parse({ unitId: ID, checkIn: "2027-02-01", checkOut: "2027-02-03", guests: "2", totalCents: 1, currency: "USD", rates: [] });
    expect(parsed).toEqual(valid);
  });
  it.each([
    { unitId: "x" }, { checkOut: "2027-02-01" }, { checkIn: "01/02/2027" }, { guests: "0" }, { guests: "1.5" },
  ])("rejects invalid input %j", (override) => {
    expect(quoteRequestSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });
});

describe("createQuoteRequestSchema", () => {
  it("adds the message language and still strips forged amounts and deposit", () => {
    const parsed = createQuoteRequestSchema.parse({ ...valid, lang: "en", totalCents: 1, depositCents: 1, depositPercent: 0 });
    expect(parsed).toEqual({ ...valid, lang: "en" });
  });
  it("rejects an unknown language and an inverted stay", () => {
    expect(createQuoteRequestSchema.safeParse({ ...valid, lang: "fr" }).success).toBe(false);
    expect(createQuoteRequestSchema.safeParse({ ...valid, lang: "es", checkOut: "2027-02-01" }).success).toBe(false);
  });
});

describe("toQuoteBreakdown", () => {
  const unit = { id: "u1", active: true, maxGuests: 4, includedGuests: 2 };
  const input = {
    unit, currency: "PEN", depositPercent: 50, checkIn: "2027-02-01", checkOut: "2027-02-03", guests: 2,
    rates: [{ id: "r1", unitId: "u1", seasonId: null, nightlyCents: 10000, weekendNightlyCents: null, extraGuestCents: 0, minNights: 1 }],
    seasons: [], fees: [{ id: "f1", unitId: "u1", name: "Cleaning", kind: "per_stay", amountCents: 5000 }],
  };
  it("carries the amounts the database cross-checks, in a self-consistent way", () => {
    const result = quoteStay(input);
    if (!result.ok) throw new Error("quote should succeed");
    const b = toQuoteBreakdown(result.quote);
    expect(b.accommodationCents + b.feesCents).toBe(b.totalCents);
    expect(b.totalCents).toBe(25000);
    expect(b.depositPercent).toBe(50);
    expect(b.depositCents).toBe(12500);
    expect(b.nights).toHaveLength(2);
    expect(b.fees).toHaveLength(1);
  });
  it("survives a JSON round trip (it is stored in a jsonb column)", () => {
    const result = quoteStay(input);
    if (!result.ok) throw new Error("quote should succeed");
    const b = toQuoteBreakdown(result.quote);
    expect(JSON.parse(JSON.stringify(b))).toEqual(b);
  });
});

describe("buildQuoteMessage", () => {
  it("renders Spanish and English with plurals and the link", () => {
    expect(buildQuoteMessage(base)).toContain("2 noches, 1 huésped");
    expect(buildQuoteMessage(base)).toContain(base.link);
    const en = buildQuoteMessage({ ...base, lang: "en", nights: 1, guests: 3 });
    expect(en).toContain("1 night, 3 guests");
    expect(en).toContain("valid until 2027-01-10");
  });
  it("adds the deposit line only when a deposit is given", () => {
    expect(buildQuoteMessage(base)).not.toContain("Adelanto");
    expect(buildQuoteMessage({ ...base, depositLabel: "S/ 150.00" })).toContain("Adelanto para reservar: S/ 150.00");
    expect(buildQuoteMessage({ ...base, lang: "en", depositLabel: "S/ 150.00" })).toContain("Deposit to book: S/ 150.00");
  });
});

describe("whatsappShareUrl", () => {
  it("encodes the text and only uses a plausible phone", () => {
    expect(whatsappShareUrl("a b&c", "+51 987 654 321")).toBe("https://wa.me/51987654321?text=a%20b%26c");
    expect(whatsappShareUrl("hi", "12")).toBe("https://wa.me/?text=hi");
    expect(whatsappShareUrl("hi")).toBe("https://wa.me/?text=hi");
  });
});

describe("siteOrigin", () => {
  it("prefers the custom domain, else <subdomain>.<root domain>", () => {
    expect(siteOrigin({ subdomain: "saywa-lodges", customDomain: "saywalodges.com", rootDomain: "saywa.pe" })).toBe("https://saywalodges.com");
    expect(siteOrigin({ subdomain: "saywa-lodges", customDomain: null, rootDomain: "saywa.pe" })).toBe("https://saywa-lodges.saywa.pe");
    expect(siteOrigin({ subdomain: "saywa-lodges", customDomain: "  ", rootDomain: "saywa.pe" })).toBe("https://saywa-lodges.saywa.pe");
  });
  it("uses http for local development hosts", () => {
    expect(siteOrigin({ subdomain: "demo", customDomain: null, rootDomain: "localhost:3000" })).toBe("http://demo.localhost:3000");
  });
  it("returns null when there is no address to build", () => {
    expect(siteOrigin({ subdomain: " ", customDomain: null, rootDomain: "saywa.pe" })).toBeNull();
  });
});

describe("quoteLinkUrl", () => {
  it("builds /<lang>/reservar/<token> and escapes the token", () => {
    expect(quoteLinkUrl("https://x.test", "en", "abc123")).toBe("https://x.test/en/reservar/abc123");
    expect(quoteLinkUrl("https://x.test", "es", "a/b?c")).toBe("https://x.test/es/reservar/a%2Fb%3Fc");
  });
});

describe("limaDate", () => {
  it("shows the civil day in Lima, not in UTC", () => {
    expect(limaDate("2027-01-10T03:00:00.000Z")).toBe("2027-01-09");
    expect(limaDate("2027-01-10T12:00:00.000Z")).toBe("2027-01-10");
  });
});
