import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The real proxy, with the database client replaced: these tests check what each host/path gets back.
const mocks = vi.hoisted(() => ({ getClaims: vi.fn(), env: { ROOT_DOMAIN: "saywa.test", DEPLOYMENT_MODE: "platform" as "platform" | "installation" } }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getClaims: mocks.getClaims } }) }));
vi.mock("./lib/env", () => ({
  env: {
    get ROOT_DOMAIN() { return mocks.env.ROOT_DOMAIN; },
    get DEPLOYMENT_MODE() { return mocks.env.DEPLOYMENT_MODE; },
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  },
}));
import { proxy } from "./proxy";

// The URL needs a parseable host; the Host header (what the proxy reads) can carry anything, even an invalid one.
const call = (host: string, path: string, headers: Record<string, string> = {}) =>
  proxy(new NextRequest(`http://${/^[\w.:-]+$/.test(host) ? host : "invalid.test"}${path}`, { headers: { host, ...headers } }));
const isNext = (r: Response) => r.headers.get("x-middleware-next") === "1";
const rewritten = (r: Response) => r.headers.get("x-middleware-rewrite");

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  mocks.getClaims.mockReset();
  mocks.getClaims.mockResolvedValue({ data: null, error: null });
  mocks.env.ROOT_DOMAIN = "saywa.test";
  mocks.env.DEPLOYMENT_MODE = "platform";
});

describe("proxy · platform mode", () => {
  it("answers 400 to an invalid host and 404 to a literal /sites path", async () => {
    expect((await call("bad host", "/")).status).toBe(400);
    expect((await call("saywa.test", "/sites/x/es")).status).toBe(404);
  });
  it("passes the landing and the dashboard through", async () => {
    expect(isNext(await call("saywa.test", "/"))).toBe(true);
    expect(isNext(await call("app.saywa.test", "/login"))).toBe(true);
    expect(rewritten(await call("app.saywa.test", "/"))).toContain("/app");
  });
  it("redirects a tenant host to its locale, then rewrites into /sites/<sub>/<lang>", async () => {
    const redirect = await call("casa.saywa.test", "/", { "accept-language": "en-US,en;q=0.9" });
    expect(redirect.status).toBe(307);
    expect(redirect.headers.get("location")).toBe("http://casa.saywa.test/en");
    expect(rewritten(await call("casa.saywa.test", "/es/reserva/abc"))).toContain("/sites/casa/es/reserva/abc");
    expect(rewritten(await call("casa.pe", "/es"))).toContain("/sites/casa.pe/es");
  });
  it("never serves the dashboard or auth on a tenant host", async () => {
    expect((await call("casa.saywa.test", "/app")).status).toBe(404);
    expect((await call("casa.pe", "/login")).status).toBe(404);
  });
  it("refreshes the session cookie on pass-through responses", async () => {
    await call("app.saywa.test", "/login");
    expect(mocks.getClaims).toHaveBeenCalled();
  });
  it("does not touch the session for rejected requests", async () => {
    await call("bad host", "/");
    await call("casa.saywa.test", "/app");
    expect(mocks.getClaims).not.toHaveBeenCalled();
  });
  it("keeps serving when the session refresh fails", async () => {
    mocks.getClaims.mockRejectedValue(new Error("outage"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(isNext(await call("app.saywa.test", "/login"))).toBe(true);
  });
});

describe("proxy · installation mode", () => {
  beforeEach(() => {
    mocks.env.DEPLOYMENT_MODE = "installation";
    mocks.env.ROOT_DOMAIN = "cliente.pe";
  });
  it("serves the client's site on the root domain, identified by the domain", async () => {
    expect((await call("cliente.pe", "/", { "accept-language": "es" })).headers.get("location")).toBe("http://cliente.pe/es");
    expect(rewritten(await call("cliente.pe", "/es"))).toContain("/sites/cliente.pe/es");
    expect(rewritten(await call("cliente.pe", "/en/reservar/abc"))).toContain("/sites/cliente.pe/en/reservar/abc");
  });
  it("passes sitemap.xml and robots.txt through on the site host", async () => {
    expect(isNext(await call("cliente.pe", "/sitemap.xml"))).toBe(true);
    expect(isNext(await call("cliente.pe", "/robots.txt"))).toBe(true);
  });
  it("does not touch the session on the public site host, but does on the panel host", async () => {
    await call("cliente.pe", "/es");
    await call("cliente.pe", "/sitemap.xml");
    expect(mocks.getClaims).not.toHaveBeenCalled();
    await call("app.cliente.pe", "/login");
    expect(mocks.getClaims).toHaveBeenCalledTimes(1);
  });
  it("answers 404 on the site host to the panel, auth and every API route", async () => {
    for (const path of ["/app", "/login", "/auth/callback", "/update-password", "/api/cron/expire-holds", "/api/ical/abc", "/api/health"]) {
      expect((await call("cliente.pe", path)).status).toBe(404);
    }
  });
  it("serves the panel, auth and API on app.<root>", async () => {
    expect(rewritten(await call("app.cliente.pe", "/"))).toContain("/app");
    for (const path of ["/login", "/auth/callback", "/app/quotes", "/api/cron/ical-sync", "/api/health"]) {
      expect(isNext(await call("app.cliente.pe", path))).toBe(true);
    }
  });
  it("answers 404 to www, subdomains and unknown hosts, and never refreshes a session for them", async () => {
    for (const host of ["www.cliente.pe", "casa.cliente.pe", "otro.pe"]) {
      expect((await call(host, "/es")).status).toBe(404);
    }
    expect(mocks.getClaims).not.toHaveBeenCalled();
  });
  it("keeps /sites/* unreachable and invalid hosts rejected", async () => {
    expect((await call("cliente.pe", "/sites/cliente.pe/es")).status).toBe(404);
    expect((await call("app.cliente.pe", "/sites/x")).status).toBe(404);
    expect((await call("bad host", "/")).status).toBe(400);
  });
});
