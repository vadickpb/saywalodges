import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  WHATSAPP_OPTIN_VERSION, WHATSAPP_TEMPLATE_BODIES, WHATSAPP_TEMPLATE_NAMES, WHATSAPP_TEMPLATE_VARIABLES, buildWhatsappMessage, normalizeWhatsappPhone,
  whatsappClaimSchema, whatsappKinds, type WhatsappClaim,
} from "./whatsapp-templates";

const claim = (over: Partial<WhatsappClaim> = {}): WhatsappClaim => ({
  id: "11111111-1111-4111-8111-111111111111", kind: "confirmation", org_id: "22222222-2222-4222-8222-222222222222",
  booking_id: "33333333-3333-4333-8333-333333333333", opt_in: true, phone: "999888777", lang: "es", guest_name: "Ana María Pérez",
  unit: "Casa 1", check_in: "2026-12-21", check_out: "2026-12-24", currency: "PEN", deposit_cents: 30000,
  expires_at: "2026-12-21T01:00:00+00:00", ...over,
});

describe("normalizeWhatsappPhone", () => {
  it.each([
    ["999 888 777", "51999888777"], ["+51 999 888 777", "51999888777"], ["0051999888777", "51999888777"], ["51999888777", "51999888777"],
    ["+1 (415) 555-2671", "14155552671"], ["(+34) 612-345-678", "34612345678"],
  ])("accepts %s", (raw, expected) => expect(normalizeWhatsappPhone(raw)).toBe(expected));
  it.each(["", "   ", "12345", "01 234 5678", "999 88", "+51 1 234 5678", "+0123456789", "abc", "9998887771", "+1234567890123456", "+51 888 888 888", "987+654321"])(
    "rejects %j instead of guessing", (raw) => expect(normalizeWhatsappPhone(raw)).toBeNull());
});

describe("templates", () => {
  it("every kind has a name and both languages with a contiguous {{n}} list that matches its sample variables", () => {
    for (const kind of whatsappKinds) {
      expect(WHATSAPP_TEMPLATE_NAMES[kind]).toMatch(/^[a-z0-9_]+$/);
      for (const lang of ["es", "en"] as const) {
        const body = WHATSAPP_TEMPLATE_BODIES[kind][lang];
        const slots = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
        expect(slots).toEqual(slots.map((_, i) => i + 1));
        expect(WHATSAPP_TEMPLATE_VARIABLES[kind][lang]).toHaveLength(slots.length);
        // Meta rejects a body that starts or ends with a variable, or has more than 1024 characters.
        expect(body.startsWith("{{")).toBe(false);
        expect(body.endsWith("}}")).toBe(false);
        expect(body.length).toBeLessThanOrEqual(1024);
      }
    }
  });

  it("docs/whatsapp.md carries the exact bodies the app sends (the owner copy-pastes them into Meta)", () => {
    const doc = readFileSync("docs/whatsapp.md", "utf8");
    for (const kind of whatsappKinds) for (const lang of ["es", "en"] as const) expect(doc).toContain(WHATSAPP_TEMPLATE_BODIES[kind][lang]);
  });

  it("the opt-in wording the database copies as evidence is exactly what the checkout shows (v1)", async () => {
    const migration = readFileSync("supabase/migrations/20261120001049_whatsapp_templates_optin.sql", "utf8");
    const { default: dictionaries } = await import("@/dictionaries/index").then((m) => ({ default: m }));
    for (const lang of ["es", "en"] as const) {
      const shown = (await dictionaries.getDictionary(lang)).checkout.whatsappOptIn;
      expect(migration).toContain(`('${WHATSAPP_OPTIN_VERSION}', '${lang}', '${shown.replaceAll("'", "''")}')`);
    }
  });

  it.each(whatsappKinds)("builds %s with exactly as many variables as the body has", (kind) => {
    for (const lang of ["es", "en"] as const) {
      const message = buildWhatsappMessage(claim({ kind, lang }));
      const slots = WHATSAPP_TEMPLATE_BODIES[kind][lang].match(/\{\{\d+\}\}/g)?.length;
      expect(message?.params).toHaveLength(slots ?? -1);
      expect(message?.template).toBe(WHATSAPP_TEMPLATE_NAMES[kind]);
      expect(message?.language).toBe(lang);
      expect(message?.params.every((p) => p.length > 0 && !/[\r\n\t]/.test(p))).toBe(true);
    }
  });

  it("uses the first name only and cleans guest-controlled text", () => {
    const message = buildWhatsappMessage(claim({ guest_name: "  Ana\nMaría\t Pérez ", unit: "Casa\r\n1" }));
    expect(message?.params.slice(0, 2)).toEqual(["Ana", "Casa 1"]);
    expect(buildWhatsappMessage(claim({ guest_name: "   " }))?.params[0]).toBe("huésped");
  });

  it("formats the deposit and the deadline in Lima time", () => {
    const message = buildWhatsappMessage(claim({ kind: "deposit_reminder", deposit_cents: 30050, expires_at: "2026-12-21T01:30:00+00:00" }));
    expect(message?.params[2]).toMatch(/300[.,]50/);
    expect(message?.params[3]).toMatch(/20/); // 20 Dec 20:30 in Lima (UTC-5)
    expect(message?.params[3]).toMatch(/8:30|20:30/);
    expect(buildWhatsappMessage(claim({ kind: "deposit_reminder", expires_at: null }))).toBeNull();
  });

  it("a claim without a literal opt_in is not a valid claim", () => {
    expect(whatsappClaimSchema.safeParse({ ...claim(), opt_in: false }).success).toBe(false);
    expect(whatsappClaimSchema.safeParse(Object.fromEntries(Object.entries(claim()).filter(([key]) => key !== "opt_in"))).success).toBe(false);
    expect(whatsappClaimSchema.safeParse(claim()).success).toBe(true);
  });
});
