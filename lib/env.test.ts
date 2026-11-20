import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// `env` throws at module-evaluation time, so each case needs a fresh module
// instance (vi.resetModules) with its own process.env — otherwise the first
// successful import would be cached and reused by every later test.
describe("env", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  function setValidEnv() {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    process.env.ROOT_DOMAIN = "localhost:3000";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  }

  it("throws a clear error when SUPABASE_URL is missing", async () => {
    setValidEnv();
    delete process.env.SUPABASE_URL;
    await expect(import("./env")).rejects.toThrow(/SUPABASE_URL/);
  });

  it("throws when SUPABASE_URL is not a valid URL", async () => {
    setValidEnv();
    process.env.SUPABASE_URL = "not-a-url";
    await expect(import("./env")).rejects.toThrow(/valid URL/);
  });

  it("throws when SUPABASE_SERVICE_ROLE_KEY is missing", async () => {
    setValidEnv();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await expect(import("./env")).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("throws when NEXT_PUBLIC_SUPABASE_URL is missing", async () => {
    setValidEnv();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    await expect(import("./env")).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("throws when NEXT_PUBLIC_SUPABASE_ANON_KEY is missing", async () => {
    setValidEnv();
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    await expect(import("./env")).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it("defaults ROOT_DOMAIN to localhost:3000 when missing", async () => {
    setValidEnv();
    delete process.env.ROOT_DOMAIN;
    const { env } = await import("./env");
    expect(env.ROOT_DOMAIN).toBe("localhost:3000");
  });

  it("throws when ROOT_DOMAIN is missing in production (no silent default)", async () => {
    setValidEnv();
    delete process.env.ROOT_DOMAIN;
    vi.stubEnv("NODE_ENV", "production");
    await expect(import("./env")).rejects.toThrow(/ROOT_DOMAIN/);
    vi.unstubAllEnvs();
  });

  it("loads successfully in production when ROOT_DOMAIN is set explicitly", async () => {
    setValidEnv();
    vi.stubEnv("NODE_ENV", "production");
    const { env } = await import("./env");
    expect(env.ROOT_DOMAIN).toBe("localhost:3000");
    vi.unstubAllEnvs();
  });

  it("defaults DEPLOYMENT_MODE to platform and rejects unknown modes", async () => {
    setValidEnv();
    const { env } = await import("./env");
    expect(env.DEPLOYMENT_MODE).toBe("platform");
    vi.resetModules();
    process.env.DEPLOYMENT_MODE = "saas";
    await expect(import("./env")).rejects.toThrow(/DEPLOYMENT_MODE/);
  });

  it("accepts vendor mode and requires NEXT_PUBLIC_SITE_URL in production", async () => {
    setValidEnv();
    process.env.ROOT_DOMAIN = "hoststay.example";
    process.env.DEPLOYMENT_MODE = "vendor";
    delete process.env.NEXT_PUBLIC_SITE_URL;
    vi.stubEnv("NODE_ENV", "production");
    await expect(import("./env")).rejects.toThrow(/NEXT_PUBLIC_SITE_URL/);
    vi.resetModules();
    process.env.NEXT_PUBLIC_SITE_URL = "https://hoststay.example";
    const { env } = await import("./env");
    expect(env.DEPLOYMENT_MODE).toBe("vendor");
    vi.unstubAllEnvs();
  });

  it("pins the vendor production URL to the HTTPS root origin", async () => {
    setValidEnv();
    process.env.ROOT_DOMAIN = "hoststay.example";
    process.env.DEPLOYMENT_MODE = "vendor";
    vi.stubEnv("NODE_ENV", "production");
    for (const invalid of [
      "http://hoststay.example",
      "https://www.hoststay.example",
      "https://hoststay.example/path",
      "https://hoststay.example?preview=1",
      "https://user:pass@hoststay.example",
    ]) {
      process.env.NEXT_PUBLIC_SITE_URL = invalid;
      vi.resetModules();
      await expect(import("./env")).rejects.toThrow(/vendor production/);
    }
    vi.unstubAllEnvs();
  });

  it("validates optional vendor CTA settings and treats empty values as absent", async () => {
    setValidEnv();
    process.env.VENDOR_WHATSAPP_NUMBER = "";
    process.env.VENDOR_CONTACT_EMAIL = "";
    process.env.VENDOR_DEMO_URL = "";
    let loaded = await import("./env");
    expect(loaded.env.VENDOR_WHATSAPP_NUMBER).toBeUndefined();
    expect(loaded.env.VENDOR_CONTACT_EMAIL).toBeUndefined();
    expect(loaded.env.VENDOR_DEMO_URL).toBeUndefined();

    vi.resetModules();
    process.env.VENDOR_WHATSAPP_NUMBER = "+51 987 654 321";
    await expect(import("./env")).rejects.toThrow(/VENDOR_WHATSAPP_NUMBER/);

    vi.resetModules();
    process.env.VENDOR_WHATSAPP_NUMBER = "51987654321";
    process.env.VENDOR_CONTACT_EMAIL = "not-an-email";
    await expect(import("./env")).rejects.toThrow(/VENDOR_CONTACT_EMAIL/);

    vi.resetModules();
    process.env.VENDOR_CONTACT_EMAIL = "";
    process.env.VENDOR_DEMO_URL = "not-a-url";
    await expect(import("./env")).rejects.toThrow(/VENDOR_DEMO_URL/);

    vi.resetModules();
    process.env.VENDOR_DEMO_URL = "ftp://demo.hoststay.example";
    await expect(import("./env")).rejects.toThrow(/http or https/);

    vi.resetModules();
    process.env.VENDOR_DEMO_URL = "https://demo.hoststay.example";
    process.env.VENDOR_CONTACT_EMAIL = "ventas@hoststay.example";
    loaded = await import("./env");
    expect(loaded.env.VENDOR_WHATSAPP_NUMBER).toBe("51987654321");
    expect(loaded.env.VENDOR_DEMO_URL).toBe("https://demo.hoststay.example");
    expect(loaded.env.VENDOR_CONTACT_EMAIL).toBe("ventas@hoststay.example");
  });

  it("requires NEXT_PUBLIC_SITE_URL in production, including platform mode", async () => {
    setValidEnv();
    delete process.env.NEXT_PUBLIC_SITE_URL;
    vi.stubEnv("NODE_ENV", "production");
    await expect(import("./env")).rejects.toThrow(/NEXT_PUBLIC_SITE_URL/);
    vi.unstubAllEnvs();
  });

  it("installation mode in production requires NEXT_PUBLIC_SITE_URL to be the panel URL", async () => {
    setValidEnv();
    process.env.ROOT_DOMAIN = "cliente.pe";
    process.env.DEPLOYMENT_MODE = "installation";
    delete process.env.NEXT_PUBLIC_SITE_URL;
    vi.stubEnv("NODE_ENV", "production");
    await expect(import("./env")).rejects.toThrow(/NEXT_PUBLIC_SITE_URL/);
    vi.resetModules();
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
    await expect(import("./env")).rejects.toThrow(/app\.cliente\.pe/);
    vi.resetModules();
    process.env.NEXT_PUBLIC_SITE_URL = "http://app.cliente.pe";
    await expect(import("./env")).rejects.toThrow(/app\.cliente\.pe/);
    vi.resetModules();
    process.env.NEXT_PUBLIC_SITE_URL = "https://user:pass@app.cliente.pe";
    await expect(import("./env")).rejects.toThrow(/app\.cliente\.pe/);
    vi.resetModules();
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.cliente.pe";
    const { env } = await import("./env");
    expect(env.DEPLOYMENT_MODE).toBe("installation");
    vi.unstubAllEnvs();
  });

  it("treats an empty NEXT_PUBLIC_SITE_URL as missing", async () => {
    setValidEnv();
    process.env.NEXT_PUBLIC_SITE_URL = "";
    vi.stubEnv("NODE_ENV", "production");
    await expect(import("./env")).rejects.toThrow(/NEXT_PUBLIC_SITE_URL/);
    vi.unstubAllEnvs();
  });

  it("rejects a malformed NEXT_PUBLIC_SITE_URL", async () => {
    setValidEnv();
    process.env.NEXT_PUBLIC_SITE_URL = "not-a-url";
    await expect(import("./env")).rejects.toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("installation mode outside production still requires the panel URL", async () => {
    setValidEnv();
    process.env.DEPLOYMENT_MODE = "installation";
    delete process.env.NEXT_PUBLIC_SITE_URL;
    await expect(import("./env")).rejects.toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("loads successfully with valid vars", async () => {
    setValidEnv();
    const { env } = await import("./env");
    expect(env.SUPABASE_URL).toBe("https://example.supabase.co");
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe("test-key");
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://example.supabase.co");
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("test-anon-key");
    expect(env.ROOT_DOMAIN).toBe("localhost:3000");
  });

  it("vendor mode needs no database credentials (SD-1127), other modes still require them", async () => {
    setValidEnv();
    for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) delete process.env[key];
    process.env.DEPLOYMENT_MODE = "vendor";
    const { env } = await import("./env");
    expect(env.SUPABASE_URL).toBe("https://no-database.invalid");
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://no-database.invalid");
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe("vendor-mode-has-no-database");
    vi.resetModules();
    process.env.DEPLOYMENT_MODE = "installation";
    await expect(import("./env")).rejects.toThrow(/SUPABASE_URL/);
    vi.resetModules();
    delete process.env.DEPLOYMENT_MODE;
    await expect(import("./env")).rejects.toThrow(/SUPABASE_URL/);
  });

  it("vendor mode treats blank Supabase variables as absent", async () => {
    setValidEnv();
    process.env.SUPABASE_URL = "";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "   ";
    process.env.DEPLOYMENT_MODE = "vendor";
    const { env } = await import("./env");
    expect(env.SUPABASE_URL).toBe("https://no-database.invalid");
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe("vendor-mode-has-no-database");
  });

  it("vendor mode keeps real credentials when they are set", async () => {
    setValidEnv();
    process.env.DEPLOYMENT_MODE = "vendor";
    const { env } = await import("./env");
    expect(env.SUPABASE_URL).toBe("https://example.supabase.co");
  });
});
