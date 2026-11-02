import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// proxy.ts must never reach Supabase in tests; getClaims is the only call it makes.
const getClaims = vi.fn(async () => ({ data: null, error: null }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getClaims } }) }));

const { proxy } = await import("../../proxy");
const { env } = await import("../env");

const get = (host: string, path: string, headers: Record<string, string> = {}) =>
  proxy(new NextRequest(`http://${host}${path}`, { headers: { host, ...headers } }));
const nonceOf = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1];

const CASES: { name: string; host: string; path: string; status: number }[] = [
  { name: "landing", host: "localhost:3000", path: "/", status: 200 },
  { name: "login on platform host", host: "localhost:3000", path: "/login", status: 200 },
  { name: "dashboard root on app host (rewrite to /app)", host: "app.localhost:3000", path: "/", status: 200 },
  { name: "dashboard route", host: "app.localhost:3000", path: "/app/bookings", status: 200 },
  { name: "tenant site with locale (rewrite)", host: "demo.localhost:3000", path: "/es", status: 200 },
  { name: "tenant custom domain (rewrite)", host: "mylodge.example", path: "/en", status: 200 },
  { name: "tenant without locale (redirect)", host: "demo.localhost:3000", path: "/", status: 307 },
  { name: "cron API", host: "localhost:3000", path: "/api/cron/expire-holds", status: 200 },
  { name: "iCal API on platform host", host: "localhost:3000", path: "/api/ical/token", status: 200 },
  { name: "dashboard path on tenant host (404)", host: "demo.localhost:3000", path: "/login", status: 404 },
  { name: "literal /sites path (404)", host: "localhost:3000", path: "/sites/x/es", status: 404 },
  { name: "invalid Host (400)", host: "x/../../app", path: "/", status: 400 },
];

beforeEach(() => {
  getClaims.mockClear();
  env.CSP_REPORT_ONLY = undefined;
});

describe("proxy CSP", () => {
  it.each(CASES)("$name: sets a nonce CSP and keeps its routing outcome", async ({ host, path, status }) => {
    const res = await get(host, path);
    // Same status the proxy gave before SD-701 (middleware "next"/"rewrite" report 200).
    expect(res.status).toBe(status);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(nonceOf(csp)).toBeTruthy();
    expect(csp).toContain("script-src 'self' 'nonce-");
    expect(csp).not.toContain("unsafe-eval");
    // Enforcing by default: the Report-Only header is not sent at all.
    expect(res.headers.get("content-security-policy-report-only")).toBeNull();
  });

  it("uses a different nonce on every request", async () => {
    const nonces = new Set<string | undefined>();
    for (let i = 0; i < 20; i++) nonces.add(nonceOf((await get("demo.localhost:3000", "/es")).headers.get("content-security-policy") ?? ""));
    expect(nonces.size).toBe(20);
  });

  it("forwards x-nonce and the CSP to the render on next and rewrite responses", async () => {
    for (const [host, path] of [["localhost:3000", "/login"], ["demo.localhost:3000", "/es"], ["app.localhost:3000", "/"]]) {
      const res = await get(host, path);
      const csp = res.headers.get("content-security-policy");
      expect(res.headers.get("x-middleware-request-x-nonce")).toBe(nonceOf(csp ?? ""));
      expect(res.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
    }
  });

  it("does not trust a client-supplied x-nonce or CSP request header", async () => {
    const res = await get("localhost:3000", "/login", { "x-nonce": "attacker", "content-security-policy": "default-src *" });
    expect(res.headers.get("x-middleware-request-x-nonce")).not.toBe("attacker");
    expect(res.headers.get("x-middleware-request-content-security-policy")).toBe(res.headers.get("content-security-policy"));
  });

  it("drops a client-supplied Report-Only header too, so it cannot win over the enforcing one", async () => {
    const res = await get("localhost:3000", "/login", { "content-security-policy-report-only": "default-src *" });
    expect(res.headers.get("x-middleware-request-content-security-policy-report-only")).toBeNull();
    expect(res.headers.get("x-middleware-request-content-security-policy")).toBe(res.headers.get("content-security-policy"));
  });

  it("preserves host-based routing: tenant rewrite target and locale redirect", async () => {
    expect((await get("demo.localhost:3000", "/es/x")).headers.get("x-middleware-rewrite")).toContain("/sites/demo/es/x");
    expect((await get("mylodge.example", "/en")).headers.get("x-middleware-rewrite")).toContain("/sites/mylodge.example/en");
    expect((await get("demo.localhost:3000", "/")).headers.get("location")).toMatch(/\/(es|en)$/);
    expect((await get("app.localhost:3000", "/")).headers.get("x-middleware-rewrite")).toContain("/app");
  });

  it("still refreshes the session cookie on every non-error route", async () => {
    await get("localhost:3000", "/login");
    await get("demo.localhost:3000", "/es");
    await get("app.localhost:3000", "/app");
    expect(getClaims).toHaveBeenCalledTimes(3);
  });

  it("switches to Report-Only when CSP_REPORT_ONLY=1, still forwarding the nonce", async () => {
    env.CSP_REPORT_ONLY = "1";
    const res = await get("demo.localhost:3000", "/es");
    expect(res.headers.get("content-security-policy")).toBeNull();
    const csp = res.headers.get("content-security-policy-report-only") ?? "";
    expect(res.headers.get("x-middleware-request-x-nonce")).toBe(nonceOf(csp));
    expect(res.headers.get("x-middleware-request-content-security-policy-report-only")).toBe(csp);
  });

  it("in Report-Only mode, a client-supplied enforcing CSP is not forwarded to Next", async () => {
    env.CSP_REPORT_ONLY = "1";
    const res = await get("demo.localhost:3000", "/es", { "content-security-policy": "script-src 'nonce-evil'" });
    expect(res.headers.get("x-middleware-request-content-security-policy")).toBeNull();
    const csp = res.headers.get("content-security-policy-report-only") ?? "";
    expect(res.headers.get("x-middleware-request-content-security-policy-report-only")).toBe(csp);
  });

  it("ignores CSP_REPORT_ONLY on a Vercel Production deployment: the policy is enforced", async () => {
    env.CSP_REPORT_ONLY = "1";
    vi.stubEnv("VERCEL_ENV", "production");
    try {
      const res = await get("demo.localhost:3000", "/es");
      expect(res.headers.get("content-security-policy-report-only")).toBeNull();
      const csp = res.headers.get("content-security-policy") ?? "";
      expect(csp).toContain("script-src");
      expect(res.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("keeps Report-Only on a Vercel Preview deployment", async () => {
    env.CSP_REPORT_ONLY = "1";
    vi.stubEnv("VERCEL_ENV", "preview");
    try {
      const res = await get("demo.localhost:3000", "/es");
      expect(res.headers.get("content-security-policy")).toBeNull();
      expect(res.headers.get("content-security-policy-report-only")).toBeTruthy();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// Installation mode (SD-1001, ADR 0010): the same nonce CSP must cover every response the proxy gives there.
describe("proxy CSP · installation mode", () => {
  beforeEach(() => {
    env.DEPLOYMENT_MODE = "installation";
  });
  afterEach(() => {
    env.DEPLOYMENT_MODE = "platform";
  });

  const INSTALLATION_CASES: { name: string; host: string; path: string; status: number }[] = [
    { name: "client site with locale (rewrite)", host: "localhost:3000", path: "/es", status: 200 },
    { name: "client site without locale (redirect)", host: "localhost:3000", path: "/", status: 307 },
    { name: "sitemap on the site host", host: "localhost:3000", path: "/sitemap.xml", status: 200 },
    { name: "panel root on app host (rewrite to /app)", host: "app.localhost:3000", path: "/", status: 200 },
    { name: "login on app host", host: "app.localhost:3000", path: "/login", status: 200 },
    { name: "cron API on app host", host: "app.localhost:3000", path: "/api/cron/expire-holds", status: 200 },
    { name: "API on the site host (404)", host: "localhost:3000", path: "/api/cron/expire-holds", status: 404 },
    { name: "login on the site host (404)", host: "localhost:3000", path: "/login", status: 404 },
    { name: "unknown host (404)", host: "other.test", path: "/es", status: 404 },
    { name: "invalid Host (400)", host: "x/../../app", path: "/", status: 400 },
  ];

  it.each(INSTALLATION_CASES)("$name: sets a nonce CSP and keeps its routing outcome", async ({ host, path, status }) => {
    const res = await get(host, path);
    expect(res.status).toBe(status);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(/'nonce-[^']+'/);
    // Responses that render forward the same nonce to Next; rejections and redirects have no render.
    if (status === 200) expect(res.headers.get("x-middleware-request-x-nonce")).toBe(nonceOf(csp));
  });

  it("does not refresh the session on the public site host", async () => {
    await get("localhost:3000", "/es");
    expect(getClaims).not.toHaveBeenCalled();
    await get("app.localhost:3000", "/login");
    expect(getClaims).toHaveBeenCalledTimes(1);
  });
});
