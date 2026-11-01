import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ host: "localhost:3000", getSiteByHost: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: mocks.host }) }));
vi.mock("@/lib/dal/public/site", () => ({
  getSiteByHost: mocks.getSiteByHost,
  siteIdentifierFromHost: (host: string) => host,
  getSiteUrl: (host: string) => `https://${host}`,
}));
import sitemap from "./sitemap";
import robots from "./robots";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.host = "localhost:3000";
  mocks.getSiteByHost.mockResolvedValue(null);
});

describe("platform SEO", () => {
  it("lists both marketing languages and allows crawling without a tenant lookup", async () => {
    const entries = await sitemap();
    expect(entries.map((entry) => entry.url)).toEqual(["http://localhost:3000/", "http://localhost:3000/en"]);
    expect(entries[0].alternates?.languages).toEqual({ es: "http://localhost:3000/", en: "http://localhost:3000/en" });
    expect(await robots()).toMatchObject({
      rules: { allow: "/", disallow: expect.arrayContaining(["/app", "/api/", "/login"]) },
      sitemap: "http://localhost:3000/sitemap.xml",
    });
    expect(mocks.getSiteByHost).not.toHaveBeenCalled();
  });
  it("does not advertise the dashboard host as a public property", async () => {
    mocks.host = "app.localhost:3000";
    expect(await sitemap()).toEqual([]);
    expect(await robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    expect(mocks.getSiteByHost).not.toHaveBeenCalled();
  });
  it("preserves tenant sitemap generation and rejects unknown hosts", async () => {
    mocks.host = "demo.localhost:3000";
    expect(await sitemap()).toEqual([]);
    expect(await robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    mocks.getSiteByHost.mockResolvedValue({ slug: "demo" });
    expect((await sitemap()).map((entry) => entry.url)).toEqual(["https://demo.localhost:3000/en", "https://demo.localhost:3000/es"]);
    expect(await robots()).toMatchObject({ sitemap: "https://demo.localhost:3000/sitemap.xml" });
  });
});
