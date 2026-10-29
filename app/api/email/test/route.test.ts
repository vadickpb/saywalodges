import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
import { POST } from "./route";

const SECRET = "preview-secret-0123456789";
const call = (init: { auth?: string; body?: unknown }) =>
  POST(
    new Request("http://localhost:3000/api/email/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(init.auth ? { Authorization: init.auth } : {}) },
      body: typeof init.body === "string" ? init.body : JSON.stringify(init.body ?? {}),
    }),
  );

beforeEach(() => {
  vi.stubEnv("EMAIL_TEST_SECRET", SECRET);
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/email/test", () => {
  it("is a 404 when no secret is configured", async () => {
    vi.stubEnv("EMAIL_TEST_SECRET", "");
    expect((await call({ auth: `Bearer ${SECRET}`, body: { to: "a@example.com" } })).status).toBe(404);
  });

  it("is a 404 in production even with the secret set", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await call({ auth: `Bearer ${SECRET}`, body: { to: "a@example.com" } })).status).toBe(404);
  });

  it("rejects a missing or wrong bearer token", async () => {
    expect((await call({ body: { to: "a@example.com" } })).status).toBe(401);
    expect((await call({ auth: "Bearer wrong", body: { to: "a@example.com" } })).status).toBe(401);
    expect((await call({ auth: SECRET, body: { to: "a@example.com" } })).status).toBe(401);
  });

  it("rejects an invalid body", async () => {
    expect((await call({ auth: `Bearer ${SECRET}`, body: { to: "nope" } })).status).toBe(400);
    expect((await call({ auth: `Bearer ${SECRET}`, body: "not json" })).status).toBe(400);
  });

  it("sends in simulation mode when no Resend key is configured", async () => {
    const res = await call({ auth: `Bearer ${SECRET}`, body: { to: "a@example.com", lang: "en" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ ok: true, simulated: true });
  });

  it("refuses recipients outside the allow-list when Resend is configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key_not_real");
    vi.stubEnv("EMAIL_FROM", "Saywa <no-reply@mail.example.com>");
    vi.stubEnv("EMAIL_ALLOWED_RECIPIENTS", "owner@example.com");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await call({ auth: `Bearer ${SECRET}`, body: { to: "guest@example.com" } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "recipient_not_allowed" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
