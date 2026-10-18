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

  it("loads successfully with valid vars", async () => {
    setValidEnv();
    const { env } = await import("./env");
    expect(env.SUPABASE_URL).toBe("https://example.supabase.co");
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe("test-key");
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://example.supabase.co");
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("test-anon-key");
  });
});
