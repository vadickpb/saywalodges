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

  it("does not require NEXT_PUBLIC_SITE_URL in platform mode, even in production", async () => {
    setValidEnv();
    vi.stubEnv("NODE_ENV", "production");
    const { env } = await import("./env");
    expect(env.DEPLOYMENT_MODE).toBe("platform");
    vi.unstubAllEnvs();
  });

  it("installation mode in production requires NEXT_PUBLIC_SITE_URL to be the panel URL", async () => {
    setValidEnv();
    process.env.ROOT_DOMAIN = "cliente.pe";
    process.env.DEPLOYMENT_MODE = "installation";
    vi.stubEnv("NODE_ENV", "production");
    await expect(import("./env")).rejects.toThrow(/NEXT_PUBLIC_SITE_URL/);
    vi.resetModules();
    process.env.NEXT_PUBLIC_SITE_URL = "https://saywalodges.com";
    await expect(import("./env")).rejects.toThrow(/app\.cliente\.pe/);
    vi.resetModules();
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.cliente.pe";
    const { env } = await import("./env");
    expect(env.DEPLOYMENT_MODE).toBe("installation");
    vi.unstubAllEnvs();
  });

  it("installation mode outside production does not require NEXT_PUBLIC_SITE_URL", async () => {
    setValidEnv();
    process.env.DEPLOYMENT_MODE = "installation";
    const { env } = await import("./env");
    expect(env.DEPLOYMENT_MODE).toBe("installation");
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
});
