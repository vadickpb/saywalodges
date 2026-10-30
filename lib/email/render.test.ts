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

describe("iCal alert templates (SD-307)", () => {
  const props = { channel: "airbnb", unitName: "Casa <b>Saywa</b>", count: 2, url: "https://app.example.com/app/calendar/feeds" } as const;

  it("renders the conflict alert in es and en with count, channel, unit and link", () => {
    const es = renderEmail({ template: "icalConflict", lang: "es", props });
    expect(es.text).toContain("2 eventos nuevos");
    expect(es.text).toContain("Airbnb");
    expect(es.html).toContain("https://app.example.com/app/calendar/feeds");
    expect(es.html).not.toContain("<b>Saywa</b>");
    const en = renderEmail({ template: "icalConflict", lang: "en", props: { ...props, count: 1 } });
    expect(en.text).toContain("1 new event");
    expect(en.html).toContain('<html lang="en">');
  });

  it("renders the feed-down alert and works without a link", () => {
    const { text, html } = renderEmail({ template: "icalFeedDown", lang: "es", props: { channel: "booking" } });
    expect(text).toContain("Booking.com");
    expect(text).toContain("24 horas");
    expect(html).not.toContain("<a ");
  });

  it("rejects unknown channels and non-https links", () => {
    expect(() => renderEmail({ template: "icalFeedDown", lang: "es", props: { channel: "evil" as never } })).toThrow(ZodError);
    expect(() => renderEmail({ template: "icalFeedDown", lang: "es", props: { channel: "vrbo", url: "http://x.example" } })).toThrow(ZodError);
  });
});
