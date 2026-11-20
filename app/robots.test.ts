import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "www.cliente.pe" }) }));
vi.mock("@/lib/env", () => ({ env: { DEPLOYMENT_MODE: "platform", ROOT_DOMAIN: "hoststay.app" } }));
vi.mock("@/config/site", () => ({ SITE_URL: "https://hoststay.app" }));
const getSiteByHost = vi.fn();
vi.mock("@/lib/dal/public/site", () => ({
  getSiteByHost: (h: string) => getSiteByHost(h), siteIdentifierFromHost: (h: string) => h, getSiteUrl: (h: string) => `https://${h}`,
}));
import robots from "./robots";

beforeEach(() => vi.clearAllMocks());
describe("tenant robots.txt (SD-1125)", () => {
  it("points to the host's own sitemap and lets crawlers read the noindex of token pages", async () => {
    getSiteByHost.mockResolvedValue({ slug: "cliente" });
    const r = await robots();
    expect(r.sitemap).toBe("https://www.cliente.pe/sitemap.xml");
    const rules = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rules.disallow).toEqual(["/admin", "/api/"]);
  });
  it("an unknown host is closed to crawlers", async () => {
    getSiteByHost.mockResolvedValue(null);
    expect(await robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});
