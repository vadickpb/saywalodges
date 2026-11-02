import { describe, expect, it } from "vitest";
import { DEFAULT_API_VERSION, parseWebhookConfig, parseWhatsappConfig } from "./config";

const live = { WHATSAPP_ACCESS_TOKEN: "tok_abcdefghijklmnop", WHATSAPP_PHONE_NUMBER_ID: "123456789012345" };

describe("parseWhatsappConfig", () => {
  it("simulates outside production without credentials", () => {
    expect(parseWhatsappConfig({})).toEqual({ mode: "simulate" });
    expect(parseWhatsappConfig({ NODE_ENV: "development" })).toEqual({ mode: "simulate" });
  });
  it("goes live when credentials exist", () => {
    expect(parseWhatsappConfig(live)).toEqual({ mode: "live", accessToken: live.WHATSAPP_ACCESS_TOKEN, phoneNumberId: live.WHATSAPP_PHONE_NUMBER_ID, apiVersion: DEFAULT_API_VERSION });
  });
  it("refuses to pretend in production", () => {
    expect(parseWhatsappConfig({ VERCEL_ENV: "production" })).toEqual({ mode: "disabled", reason: "missing_credentials" });
    expect(parseWhatsappConfig({ VERCEL_ENV: "production", WHATSAPP_MODE: "simulate" })).toEqual({ mode: "disabled", reason: "simulate_in_production" });
    expect(parseWhatsappConfig({ VERCEL_ENV: "production", WHATSAPP_ACCESS_TOKEN: "x" })).toEqual({ mode: "disabled", reason: "missing_credentials" });
  });
  it("a preview never goes live by accident: VERCEL_ENV=preview without credentials simulates", () => {
    expect(parseWhatsappConfig({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toEqual({ mode: "simulate" });
  });
  it("validates the phone number id and the API version", () => {
    expect(parseWhatsappConfig({ ...live, WHATSAPP_PHONE_NUMBER_ID: "12/../34" })).toEqual({ mode: "disabled", reason: "invalid_phone_number_id" });
    expect(parseWhatsappConfig({ ...live, WHATSAPP_API_VERSION: "latest" })).toEqual({ mode: "disabled", reason: "invalid_api_version" });
    expect(parseWhatsappConfig({ ...live, WHATSAPP_API_VERSION: "v22.0" })).toMatchObject({ mode: "live", apiVersion: "v22.0" });
  });
  it("blank values count as unset", () => {
    expect(parseWhatsappConfig({ WHATSAPP_ACCESS_TOKEN: "  ", WHATSAPP_PHONE_NUMBER_ID: "" })).toEqual({ mode: "simulate" });
  });
});

describe("parseWebhookConfig", () => {
  it("needs both values, at least 16 chars each", () => {
    expect(parseWebhookConfig({ WHATSAPP_APP_SECRET: "a".repeat(32), WHATSAPP_VERIFY_TOKEN: "b".repeat(20) })).toEqual({ appSecret: "a".repeat(32), verifyToken: "b".repeat(20) });
    expect(parseWebhookConfig({ WHATSAPP_APP_SECRET: "short", WHATSAPP_VERIFY_TOKEN: "b".repeat(20) })).toBeNull();
    expect(parseWebhookConfig({ WHATSAPP_APP_SECRET: "a".repeat(32) })).toBeNull();
    expect(parseWebhookConfig({})).toBeNull();
  });
});
