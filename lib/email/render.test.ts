import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import { renderEmail } from "./render";
import { cleanText, httpsUrl } from "./content";

describe("renderEmail", () => {
  it("renders the Spanish template with lang attribute, subject and plain text", () => {
    const email = renderEmail({ template: "test", lang: "es", props: { name: "Ana" } });
    expect(email.subject).toBe("Correo de prueba · Saywa Direct");
    expect(email.html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(email.html).toContain('<html lang="es">');
    expect(email.html).toContain("Hola Ana,");
    expect(email.text).toContain("Hola Ana,");
    expect(email.text).toContain("Enviado por Saywa Direct");
  });

  it("renders the English template", () => {
    const email = renderEmail({ template: "test", lang: "en", props: { name: "Ana" } });
    expect(email.subject).toBe("Test email · Saywa Direct");
    expect(email.html).toContain('<html lang="en">');
    expect(email.html).toContain("Hi Ana,");
    expect(email.html).not.toContain("Hola");
  });

  it("falls back to an anonymous greeting without a name", () => {
    expect(renderEmail({ template: "test", lang: "es", props: {} }).text).toContain("Hola,");
    expect(renderEmail({ template: "test", lang: "en", props: {} }).text).toContain("Hi,");
  });

  it("escapes user-controlled values in the HTML", () => {
    const evil = `<script>alert(1)</script><img src=x onerror="y">`;
    const { html } = renderEmail({ template: "test", lang: "en", props: { name: evil } });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("strips control characters from names so they cannot reach headers", () => {
    const { html, subject } = renderEmail({ template: "test", lang: "en", props: { name: "Ana\r\nBcc: x@y.com" } });
    expect(html).not.toMatch(/\r|\n.*Bcc/);
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it("rejects invalid props with a ZodError", () => {
    expect(() => renderEmail({ template: "test", lang: "es", props: { name: "x".repeat(101) } })).toThrow(ZodError);
  });
});

describe("helpers", () => {
  it("cleanText removes control chars and truncates", () => {
    expect(cleanText("a\u0000b\nc d", 10)).toBe("a b c d");
    expect(cleanText("  abcdef ", 3)).toBe("abc");
  });

  it("httpsUrl only accepts https URLs", () => {
    expect(httpsUrl.safeParse("https://example.com/x").success).toBe(true);
    for (const bad of ["http://example.com", "javascript:alert(1)", "not a url", "data:text/html,x"]) {
      expect(httpsUrl.safeParse(bad).success).toBe(false);
    }
  });
});
