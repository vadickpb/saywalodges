import { describe, expect, it } from "vitest";
import { marketingUrls, whatsappUrl } from "./marketing";

describe("marketing links", () => {
  it("uses the platform domain for canonical URLs and the demo tenant for the demo", () => {
    expect(marketingUrls("platform.example", "demo", "es")).toEqual({
      base: "https://platform.example",
      canonical: "https://platform.example/",
      languages: { es: "https://platform.example/", en: "https://platform.example/en" },
      demo: "https://demo.platform.example/es",
    });
  });
  it("preserves the local port and language when switching to the demo", () => {
    const links = marketingUrls("localhost:3000", "demo", "en");
    expect(links.canonical).toBe("http://localhost:3000/en");
    expect(links.demo).toBe("http://demo.localhost:3000/en");
  });
  it("does not downgrade production hosts containing localhost", () => {
    expect(marketingUrls("localhost.example", "demo", "en").base).toBe("https://localhost.example");
  });
  it("encodes the entire WhatsApp message without turning message text into URL parameters", () => {
    const message = "Hola, ¿una demo? A&B + Perú / #reservas";
    const url = new URL(whatsappUrl("51000000000", message));
    expect(url.origin).toBe("https://wa.me");
    expect(url.pathname).toBe("/51000000000");
    expect([...url.searchParams]).toEqual([["text", message]]);
    expect(url.hash).toBe("");
  });
});
