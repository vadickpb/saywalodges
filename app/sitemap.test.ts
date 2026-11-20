import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const host = vi.hoisted(() => ({ value: "www.cliente.pe" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: host.value }) }));
vi.mock("@/lib/env", () => ({ env: { DEPLOYMENT_MODE: "platform", ROOT_DOMAIN: "hoststay.app" } }));
vi.mock("@/config/site", () => ({ SITE_URL: "https://hoststay.app" }));
const getSiteByHost = vi.fn();
vi.mock("@/lib/dal/public/site", () => ({
  getSiteByHost: (h: string) => getSiteByHost(h),
  siteIdentifierFromHost: (h: string) => h,
  getSiteUrl: (h: string) => `https://${h}`,
}));
vi.mock("@/lib/dal/public/property", () => ({ getProperty: async () => ({ id: "p1" }) }));
vi.mock("@/lib/dal/public/showcase-units", () => ({ getShowcaseUnits: async () => [{ id: "u1", cover: "https://img/u1.jpg" }] }));
import sitemap from "./sitemap";

beforeEach(() => { vi.clearAllMocks(); host.value = "www.cliente.pe"; });

describe("tenant sitemap (SD-1125)", () => {
  it("lists home and every unit in both languages with hreflang alternates", async () => {
    getSiteByHost.mockResolvedValue({ slug: "cliente" });
    const entries = await sitemap();
    expect(entries.map((e) => e.url)).toEqual([
      "https://www.cliente.pe/es", "https://www.cliente.pe/en",
      "https://www.cliente.pe/es/alojamientos/u1", "https://www.cliente.pe/en/alojamientos/u1",
    ]);
    for (const entry of entries) {
      expect(entry.alternates?.languages).toEqual({
        es: entry.url.replace("/en", "/es"), en: entry.url.replace("/es", "/en"),
      });
    }
    expect(entries.at(-1)?.images).toEqual(["https://img/u1.jpg"]);
  });
  it("an unknown host gets an empty sitemap", async () => {
    getSiteByHost.mockResolvedValue(null);
    expect(await sitemap()).toEqual([]);
  });
});
