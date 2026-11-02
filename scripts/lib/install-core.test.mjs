import { describe, expect, it } from "vitest";
import {
  VERCEL_IGNORE_COMMAND, appHost, appOrigin, authUrls, buildSeed, buildVercelEnv, dnsChecklist, generateSecret, parseInstallConfig,
} from "./install-core.mjs";

const base = {
  slug: "casa-andina",
  name: "Casa Andina",
  rootDomain: "casaandina.pe",
  ownerEmail: "Dueno@Casaandina.PE",
  whatsappNumber: "51999999999",
  supabase: { projectRef: "abcdefghijklmnopqrst" },
  vercel: { projectName: "casa-andina" },
};
const secrets = { supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co", anonKey: "anon", serviceRoleKey: "svc", cronSecret: "a".repeat(64), healthSecret: "b".repeat(64) };

describe("parseInstallConfig", () => {
  it("normalizes and applies defaults", () => {
    const cfg = parseInstallConfig(base);
    expect(cfg.ownerEmail).toBe("dueno@casaandina.pe");
    expect(cfg.currency).toBe("PEN");
    expect(cfg.vercel.repo).toBe("vadickpb/saywalodges");
    expect(cfg.email.poweredBy).toBe(false);
  });
  it.each([
    ["rootDomain", "https://casaandina.pe"],
    ["rootDomain", "casaandina.pe:3000"],
    ["rootDomain", "app.casaandina.pe"],
    ["rootDomain", "www.casaandina.pe"],
    ["rootDomain", "localhost"],
    ["slug", "Casa Andina"],
    ["whatsappNumber", "+51 999 999 999"],
    ["ownerEmail", "not-an-email"],
  ])("rejects an invalid %s (%s)", (key, value) => {
    expect(() => parseInstallConfig({ ...base, [key]: value })).toThrow();
  });
  it("validates email.from and email.replyTo (no header injection)", () => {
    expect(() => parseInstallConfig({ ...base, email: { from: "Casa <r@mail.casaandina.pe>", replyTo: "Reservas@CasaAndina.pe" } })).not.toThrow();
    expect(() => parseInstallConfig({ ...base, email: { from: "r@mail.casaandina.pe" } })).not.toThrow();
    expect(() => parseInstallConfig({ ...base, email: { from: "Casa <r@x.pe>\r\nBcc: a@b.c" } })).toThrow();
    expect(() => parseInstallConfig({ ...base, email: { from: "no-address" } })).toThrow();
    expect(() => parseInstallConfig({ ...base, email: { replyTo: "not an email" } })).toThrow();
  });
  it.each(["status", "docs", "app", "www", "api"])("rejects the reserved subdomain %s as slug", (slug) => {
    expect(() => parseInstallConfig({ ...base, slug })).toThrow(/reserved/);
  });
  it("rejects a project ref that is not 20 lowercase letters", () => {
    expect(() => parseInstallConfig({ ...base, supabase: { projectRef: "short" } })).toThrow();
  });
  it("rejects unknown keys (typos must not be silently ignored)", () => {
    expect(() => parseInstallConfig({ ...base, rootDomian: "x.pe" })).toThrow();
  });
});

describe("derived values", () => {
  const cfg = parseInstallConfig(base);
  it("panel lives on app.<root>", () => {
    expect(appHost(cfg)).toBe("app.casaandina.pe");
    expect(appOrigin(cfg)).toBe("https://app.casaandina.pe");
  });
  it("auth allow-list is only the panel callback (with and without query)", () => {
    expect(authUrls(cfg)).toEqual({ siteUrl: "https://app.casaandina.pe", allowList: ["https://app.casaandina.pe/auth/callback", "https://app.casaandina.pe/auth/callback**"] });
  });
  it("dns checklist covers apex, app and www", () => {
    expect(dnsChecklist(cfg).map((r) => r.host)).toEqual(["casaandina.pe", "app.casaandina.pe", "www.casaandina.pe"]);
  });
  it("generateSecret yields 64 hex chars from 32 bytes", () => {
    expect(generateSecret((n) => Buffer.alloc(n, 0xab))).toBe("ab".repeat(32));
  });
});

describe("buildVercelEnv", () => {
  const cfg = parseInstallConfig({ ...base, email: { from: "Casa Andina <r@mail.casaandina.pe>", poweredBy: true } });
  const env = Object.fromEntries(buildVercelEnv(cfg, secrets).map((v) => [v.key, v]));
  it("sets installation mode, domain and the panel URL required by env validation", () => {
    expect(env.DEPLOYMENT_MODE.value).toBe("installation");
    expect(env.ROOT_DOMAIN.value).toBe("casaandina.pe");
    expect(env.NEXT_PUBLIC_SITE_URL.value).toBe("https://app.casaandina.pe");
  });
  it("brands the emails and marks secrets as sensitive and production-only", () => {
    expect(env.EMAIL_BRAND_NAME.value).toBe("Casa Andina");
    expect(env.EMAIL_POWERED_BY.value).toBe("true");
    for (const k of ["SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET", "HEALTH_SECRET"]) {
      expect(env[k].type).toBe("sensitive");
      expect(env[k].target).toEqual(["production"]);
    }
    expect(Object.values(env).every((v) => v.target.length === 1 && v.target[0] === "production")).toBe(true);
    expect(VERCEL_IGNORE_COMMAND).toContain("production");
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY.type).toBe("plain");
  });
  it("only includes RESEND_API_KEY when given, and never the service role in a public variable", () => {
    expect(env.RESEND_API_KEY).toBeUndefined();
    const withKey = buildVercelEnv(cfg, { ...secrets, resendApiKey: "re_x" });
    expect(withKey.find((v) => v.key === "RESEND_API_KEY")?.type).toBe("sensitive");
    expect(withKey.filter((v) => v.key.startsWith("NEXT_PUBLIC_")).some((v) => v.value === "svc")).toBe(false);
  });
  it("refuses missing or weak secrets", () => {
    expect(() => buildVercelEnv(cfg, { ...secrets, anonKey: "" })).toThrow(/anonKey/);
    expect(() => buildVercelEnv(cfg, { ...secrets, cronSecret: "short" })).toThrow(/32/);
    expect(() => buildVercelEnv(cfg, { ...secrets, healthSecret: "short" })).toThrow(/32/);
    expect(() => buildVercelEnv(cfg, { ...secrets, healthSecret: secrets.cronSecret })).toThrow(/differ/);
  });
});

describe("buildSeed", () => {
  const cfg = parseInstallConfig(base);
  const seed = buildSeed(cfg, "user-1");
  it("creates an unpublished property whose custom_domain is the root domain", () => {
    const p = seed.property("org-1");
    expect(p).toMatchObject({ org_id: "org-1", custom_domain: "casaandina.pe", published: false, subdomain: "casa-andina", currency: "PEN" });
  });
  it("makes the owner a member with role owner", () => {
    expect(seed.membership("org-1")).toEqual({ org_id: "org-1", user_id: "user-1", role: "owner" });
  });
});
