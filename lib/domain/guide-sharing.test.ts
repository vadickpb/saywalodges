import { describe, expect, it } from "vitest";
import { guideSharingCopy } from "@/dictionaries/guide-sharing";

const url = "https://casa.example/es/guia/private-token";
describe("guest guide messages", () => {
  it("includes the guest, property, URL and password on separate lines in Spanish", () => {
    expect(guideSharingCopy("es").guestMessage(url, "casa123", "Lucía", "Casa Saywa")).toBe(
      `Hola Lucía, estas son las instrucciones y reglas de la casa Casa Saywa:\n${url}\nContraseña: casa123`,
    );
  });
  it("builds the equivalent English message without changing the supplied credentials", () => {
    const englishUrl = url.replace("/es/", "/en/");
    expect(guideSharingCopy("en").guestMessage(englishUrl, "a & b123", "Alex", "Saywa Lodge")).toBe(
      `Hi Alex, here are the instructions and house rules for Saywa Lodge:\n${englishUrl}\nPassword: a & b123`,
    );
  });
  it("falls back to Spanish for unknown languages", () => {
    expect(guideSharingCopy("fr").guestMessage(url, "casa123", "Ana", "Saywa")).toBe(
      guideSharingCopy("es").guestMessage(url, "casa123", "Ana", "Saywa"),
    );
  });
});
