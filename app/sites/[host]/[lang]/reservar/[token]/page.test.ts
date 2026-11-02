import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
const read = vi.fn();
const redirect = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); });
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, redirect: (url: string) => redirect(url) }));
vi.mock("@/lib/dal/public/quote-checkout", () => ({ getQuoteCheckout: (...args: unknown[]) => read(...args) }));
vi.mock("@/lib/dal/public/site", () => ({ getSiteByHost: async () => ({slug:"demo"}) }));
vi.mock("@/lib/dal/public/property", () => ({ getProperty: async () => ({name:"Demo"}), whatsappUrl: () => "https://wa.me/51999000111" }));
vi.mock("./actions", () => ({ submitCheckout: vi.fn() }));
import Page, { generateMetadata } from "./page";
const token="a".repeat(64);
const params = (lang="es", t=token) => Promise.resolve({host:"demo",lang,token:t});
const quote = { property_name: "Demo", unit_name: "<script>alert('x')</script>", check_in: "2030-01-01", check_out: "2030-01-02",
  guests: 2, currency: "USD", total_cents: 50000, deposit_cents: 25000, balance_cents: 25000,
  expires_at: "2030-01-01T00:00:00+00:00", hold_minutes: 120 };
beforeEach(() => vi.clearAllMocks());
describe("checkout page", () => {
  it.each(["es", "en"])("localizes metadata and prevents indexing/referrer disclosure in %s", async lang => {
    const metadata = await generateMetadata({ params: params(lang) });
    expect(metadata.title).toBe(lang === "es" ? "Completa tu reserva" : "Complete your booking");
    expect(metadata.robots).toEqual({index:false,follow:false});
    expect(metadata.referrer).toBe("no-referrer");
  });
  it("uses the same helpful screen for expired, invalid and cross-tenant links",async () => {
    read.mockResolvedValue(null);
    const invalid=renderToStaticMarkup(await Page({params:params("es","invalid")}));
    const expired=renderToStaticMarkup(await Page({params:params()}));
    expect(invalid).toBe(expired);
    expect(invalid).toContain('href="https://wa.me/51999000111"');
    expect(invalid).toContain('referrerPolicy="no-referrer"');
    expect(invalid).not.toContain('<form');
    expect(invalid).not.toContain(token);
  });
  it("does not leak error details on a lookup outage",async () => {
    read.mockRejectedValue(new Error(`secret ${token}`));
    const html=renderToStaticMarkup(await Page({params:params()}));
    expect(html).not.toContain("secret");
    expect(html).toContain("No pudimos completar la reserva");
    expect(html).toContain("Reintentar");
    expect(html).not.toContain("Este enlace de reserva no está disponible");
    expect(html).not.toContain("wa.me");
    expect(html).toContain(`href="/es/reservar/${token}"`);
  });
  it("redirects converted quotes to the existing status page",async () => {
    const publicToken="b".repeat(64);
    read.mockResolvedValue({public_token:publicToken});
    await expect(Page({params:params()})).rejects.toThrow(`REDIRECT:/es/reserva/${publicToken}`);
  });
  it.each(["en","es"])("renders localized summary and labeled form safely in %s",async lang => {
    read.mockResolvedValue(quote);
    const html=renderToStaticMarkup(await Page({params:params(lang)}));
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain('for="name"');
    expect(html).toContain('for="email"');
    expect(html).toContain('for="phone"');
    expect(html).toContain('for="terms"');
    expect(html).toContain('name="token"');
    expect(html).not.toContain('name="total_cents"');
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).toContain(lang === "es" ? "Completa tu reserva" : "Complete your booking");
  });
});
