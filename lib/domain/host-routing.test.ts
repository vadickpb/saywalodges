import { describe, expect, it } from "vitest";
import { decideRoute, isNoRewritePath, isValidHost, siteHostFor, type DeploymentMode } from "./host-routing";

const ROOT = "saywa.test";
const decide = (host: string, pathname: string, mode: DeploymentMode) => decideRoute({ host, pathname, rootDomain: ROOT, mode });

describe("isValidHost", () => {
  it("accepts plausible hosts with an optional port", () => {
    for (const h of ["saywa.test", "app.saywa.test", "localhost:3000", "demo.localhost:3000", "a-b.example.co.pe"]) {
      expect(isValidHost(h)).toBe(true);
    }
  });
  it("rejects anything that could ride into a path", () => {
    for (const h of ["", "x/../../app", "a b", "a.test/evil", "-a.test", "a..test", "host:99999999"]) {
      expect(isValidHost(h)).toBe(false);
    }
  });
});

describe("isNoRewritePath", () => {
  it("matches the listed roots and their children, not look-alikes", () => {
    expect(isNoRewritePath("/app")).toBe(true);
    expect(isNoRewritePath("/app/rates")).toBe(true);
    expect(isNoRewritePath("/login")).toBe(true);
    expect(isNoRewritePath("/appendix")).toBe(false);
    expect(isNoRewritePath("/es")).toBe(false);
  });
});

describe("platform mode (unchanged behavior)", () => {
  it("rejects invalid hosts and literal /sites paths on every host", () => {
    expect(decide("bad/host", "/", "platform")).toEqual({ type: "invalid-host" });
    for (const host of [ROOT, `app.${ROOT}`, `casa.${ROOT}`, "casa.pe"]) {
      expect(decide(host, "/sites/casa/es", "platform")).toEqual({ type: "not-found" });
      expect(decide(host, "/sites", "platform")).toEqual({ type: "not-found" });
    }
  });
  it("serves the landing and the dashboard natively on the platform hosts", () => {
    expect(decide(ROOT, "/", "platform")).toEqual({ type: "pass" });
    expect(decide(ROOT, "/api/cron/expire-holds", "platform")).toEqual({ type: "pass" });
    expect(decide(`app.${ROOT}`, "/login", "platform")).toEqual({ type: "pass" });
    expect(decide(`app.${ROOT}`, "/app/rates", "platform")).toEqual({ type: "pass" });
    expect(decide(`app.${ROOT}`, "/", "platform")).toEqual({ type: "rewrite-panel-root" });
  });
  it("treats <sub>.<root> as a tenant site and any other host as a custom domain", () => {
    expect(decide(`casa.${ROOT}`, "/es", "platform")).toEqual({ type: "site", siteIdentifier: "casa" });
    expect(decide("casa.pe", "/es", "platform")).toEqual({ type: "site", siteIdentifier: "casa.pe" });
    expect(decide("www.casa.pe", "/", "platform")).toEqual({ type: "site", siteIdentifier: "www.casa.pe" });
  });
  it("never serves the dashboard or auth on a tenant host", () => {
    for (const host of [`casa.${ROOT}`, "casa.pe"]) {
      for (const path of ["/app", "/app/rates", "/login", "/auth/callback", "/forgot-password", "/update-password"]) {
        expect(decide(host, path, "platform")).toEqual({ type: "not-found" });
      }
    }
  });
  it("keeps the existing behavior for sitemap.xml and robots.txt on a tenant host", () => {
    // Characterization test: today these two are in NO_REWRITE_PATHS, so a tenant host answers 404.
    expect(decide(`casa.${ROOT}`, "/sitemap.xml", "platform")).toEqual({ type: "not-found" });
    expect(decide(ROOT, "/sitemap.xml", "platform")).toEqual({ type: "pass" });
  });
});

describe("installation mode", () => {
  it("rejects invalid hosts and literal /sites paths", () => {
    expect(decide("bad/host", "/", "installation")).toEqual({ type: "invalid-host" });
    for (const host of [ROOT, `app.${ROOT}`, "other.pe"]) {
      expect(decide(host, "/sites/x/es", "installation")).toEqual({ type: "not-found" });
    }
  });
  it("serves the client's public site on the root domain, identified by the domain itself", () => {
    expect(decide(ROOT, "/", "installation")).toEqual({ type: "site", siteIdentifier: ROOT });
    expect(decide(ROOT, "/es", "installation")).toEqual({ type: "site", siteIdentifier: ROOT });
    expect(decide(ROOT, "/en/reservar/abc", "installation")).toEqual({ type: "site", siteIdentifier: ROOT });
  });
  it("lets sitemap.xml and robots.txt through on the site host (they read the host themselves)", () => {
    expect(decide(ROOT, "/sitemap.xml", "installation")).toEqual({ type: "pass" });
    expect(decide(ROOT, "/robots.txt", "installation")).toEqual({ type: "pass" });
  });
  it("never serves the panel, auth or API on the site host", () => {
    for (const path of ["/app", "/app/rates", "/login", "/auth/callback", "/forgot-password", "/update-password", "/api", "/api/cron/expire-holds", "/api/ical/abc", "/api/whatsapp/webhook"]) {
      expect(decide(ROOT, path, "installation")).toEqual({ type: "not-found" });
    }
  });
  it("serves the panel, auth and every /api/* route natively on app.<root>", () => {
    const panel = `app.${ROOT}`;
    for (const path of ["/login", "/auth/callback", "/update-password", "/app/quotes", "/api/cron/ical-sync", "/api/ical/abc", "/api/health", "/sitemap.xml", "/anything"]) {
      expect(decide(panel, path, "installation")).toEqual({ type: "pass" });
    }
    expect(decide(panel, "/", "installation")).toEqual({ type: "rewrite-panel-root" });
  });
  it("answers 404, without a database lookup, for www, subdomains and any other host", () => {
    for (const host of [`www.${ROOT}`, `casa.${ROOT}`, "other.pe", "app.other.pe"]) {
      expect(decide(host, "/es", "installation")).toEqual({ type: "not-found" });
      expect(decide(host, "/login", "installation")).toEqual({ type: "not-found" });
    }
  });
});

describe("siteHostFor", () => {
  const base = { rootDomain: ROOT, subdomain: "casa", customDomain: null };
  it("platform: custom domain first, else <subdomain>.<root>", () => {
    expect(siteHostFor({ ...base, mode: "platform" })).toBe(`casa.${ROOT}`);
    expect(siteHostFor({ ...base, mode: "platform", customDomain: "casa.pe" })).toBe("casa.pe");
    expect(siteHostFor({ ...base, mode: "platform", customDomain: "  " })).toBe(`casa.${ROOT}`);
  });
  it("installation: always the root domain", () => {
    expect(siteHostFor({ ...base, mode: "installation" })).toBe(ROOT);
    expect(siteHostFor({ ...base, mode: "installation", customDomain: "other.pe" })).toBe(ROOT);
  });
});
