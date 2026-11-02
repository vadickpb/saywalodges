import { describe, it, expect } from "vitest";
import { DEFAULT_BRAND_NAME, getEmailTestSecret, isProductionEnv, isRecipientAllowed, parseEmailBrand, parseEmailConfig, parseSender } from "./config";

const KEY = "re_test_key_not_real";
const FROM = "Saywa Direct <reservas@mail.example.com>";

describe("parseEmailBrand", () => {
  it("defaults to the product name, without 'powered by'", () => {
    expect(parseEmailBrand({})).toEqual({ name: DEFAULT_BRAND_NAME, poweredBy: false });
    expect(parseEmailBrand({ EMAIL_BRAND_NAME: "  " })).toEqual({ name: DEFAULT_BRAND_NAME, poweredBy: false });
    expect(parseEmailBrand({ EMAIL_POWERED_BY: "true" })).toEqual({ name: DEFAULT_BRAND_NAME, poweredBy: false });
  });
  it("uses the configured name and only adds 'powered by' when asked", () => {
    expect(parseEmailBrand({ EMAIL_BRAND_NAME: "Casa Marian" })).toEqual({ name: "Casa Marian", poweredBy: false });
    expect(parseEmailBrand({ EMAIL_BRAND_NAME: "Casa Marian", EMAIL_POWERED_BY: "true" }).poweredBy).toBe(true);
    expect(parseEmailBrand({ EMAIL_BRAND_NAME: "Casa Marian", EMAIL_POWERED_BY: "1" }).poweredBy).toBe(true);
    expect(parseEmailBrand({ EMAIL_BRAND_NAME: "Casa Marian", EMAIL_POWERED_BY: "no" }).poweredBy).toBe(false);
  });
  it("strips control characters (header injection) and caps the length", () => {
    expect(parseEmailBrand({ EMAIL_BRAND_NAME: "Casa\r\nBcc: x@evil.test" }).name).toBe("Casa  Bcc: x@evil.test");
    expect(parseEmailBrand({ EMAIL_BRAND_NAME: "a".repeat(200) }).name).toHaveLength(80);
  });
});

describe("parseSender", () => {
  it("accepts a bare address and a display-name address", () => {
    expect(parseSender("a@mail.example.com")).toBe("a@mail.example.com");
    expect(parseSender(FROM)).toBe(FROM);
  });

  it("rejects malformed senders and header injection", () => {
    for (const bad of ["", "not-an-email", "Name <nope>", "a@b.com\r\nBcc: x@y.com", "Name\r\n <a@mail.example.com>", "<a@b.com> extra"]) {
      expect(parseSender(bad)).toBeNull();
    }
  });
});

describe("isProductionEnv", () => {
  it("prefers VERCEL_ENV over NODE_ENV (a preview build runs with NODE_ENV=production)", () => {
    expect(isProductionEnv({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(false);
    expect(isProductionEnv({ VERCEL_ENV: "production", NODE_ENV: "production" })).toBe(true);
    expect(isProductionEnv({ NODE_ENV: "production" })).toBe(true);
    expect(isProductionEnv({ NODE_ENV: "development" })).toBe(false);
  });
});

describe("parseEmailConfig", () => {
  it("simulates when there is no key outside production, so previews and CI never need one", () => {
    expect(parseEmailConfig({ VERCEL_ENV: "preview" })).toEqual({ mode: "simulate" });
    expect(parseEmailConfig({ RESEND_API_KEY: "  ", NODE_ENV: "development" })).toEqual({ mode: "simulate" });
  });

  it("refuses to pretend in production: a missing key or simulate mode disables sending", () => {
    expect(parseEmailConfig({ VERCEL_ENV: "production" })).toEqual({ mode: "disabled", reason: "missing_api_key" });
    expect(parseEmailConfig({ VERCEL_ENV: "production", EMAIL_MODE: "simulate", RESEND_API_KEY: KEY })).toEqual({
      mode: "disabled",
      reason: "simulate_in_production",
    });
  });

  it("uses Resend when a key and a valid sender are set", () => {
    const config = parseEmailConfig({ VERCEL_ENV: "production", RESEND_API_KEY: KEY, EMAIL_FROM: FROM, EMAIL_REPLY_TO: "owner@example.com" });
    expect(config).toEqual({ mode: "resend", apiKey: KEY, from: FROM, replyTo: "owner@example.com", allowedRecipients: null });
  });

  it("fails closed on a missing or invalid sender or reply-to", () => {
    expect(parseEmailConfig({ RESEND_API_KEY: KEY })).toEqual({ mode: "disabled", reason: "invalid_from" });
    expect(parseEmailConfig({ RESEND_API_KEY: KEY, EMAIL_FROM: "x\r\ny@z.com" })).toEqual({ mode: "disabled", reason: "invalid_from" });
    expect(parseEmailConfig({ RESEND_API_KEY: KEY, EMAIL_FROM: FROM, EMAIL_REPLY_TO: "nope" })).toEqual({ mode: "disabled", reason: "invalid_reply_to" });
  });

  it("restricts recipients outside production, empty list meaning nobody", () => {
    const base = { VERCEL_ENV: "preview", RESEND_API_KEY: KEY, EMAIL_FROM: FROM };
    expect(parseEmailConfig(base)).toMatchObject({ allowedRecipients: [] });
    expect(parseEmailConfig({ ...base, EMAIL_ALLOWED_RECIPIENTS: " Me@Example.com, @team.example.com " })).toMatchObject({
      allowedRecipients: ["me@example.com", "@team.example.com"],
    });
  });

  it("never leaks the key in a disabled config", () => {
    expect(JSON.stringify(parseEmailConfig({ RESEND_API_KEY: KEY }))).not.toContain(KEY);
  });
});

describe("isRecipientAllowed", () => {
  const config = (allowedRecipients: string[] | null) => ({ mode: "resend" as const, apiKey: KEY, from: FROM, allowedRecipients });

  it("matches exact addresses and @domain entries, case-insensitively", () => {
    const c = config(["me@example.com", "@team.example.com"]);
    expect(isRecipientAllowed(c, "ME@example.com")).toBe(true);
    expect(isRecipientAllowed(c, "anyone@team.example.com")).toBe(true);
    expect(isRecipientAllowed(c, "guest@gmail.com")).toBe(false);
    expect(isRecipientAllowed(c, "x@evil-team.example.com")).toBe(false);
  });

  it("allows everyone when unrestricted (production) and nobody for an empty list", () => {
    expect(isRecipientAllowed(config(null), "guest@gmail.com")).toBe(true);
    expect(isRecipientAllowed(config([]), "guest@gmail.com")).toBe(false);
  });
});

describe("getEmailTestSecret", () => {
  it("is only available outside production and with a long enough secret", () => {
    const secret = "s".repeat(16);
    expect(getEmailTestSecret({ EMAIL_TEST_SECRET: secret })).toBe(secret);
    expect(getEmailTestSecret({ EMAIL_TEST_SECRET: secret, VERCEL_ENV: "production" })).toBeNull();
    expect(getEmailTestSecret({ EMAIL_TEST_SECRET: "short" })).toBeNull();
    expect(getEmailTestSecret({})).toBeNull();
  });
});
