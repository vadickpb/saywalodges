import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import { renderEmail } from "./render";
import { cleanText, httpsUrl } from "./content";

describe("renderEmail · brand", () => {
  const brand = { name: "Casa Marian", poweredBy: false };
  it("uses the configured brand in the subject, header and footer, in both languages", () => {
    const es = renderEmail({ template: "test", lang: "es", props: {} }, brand);
    expect(es.subject).toBe("Correo de prueba · Casa Marian");
    expect(es.html).toContain("Casa Marian");
    expect(es.text).toContain("Enviado por Casa Marian");
    expect(es.text).toContain("el envío transaccional de Casa Marian");
    const en = renderEmail({ template: "icalConflict", lang: "en", props: { channel: "airbnb", count: 2, unitName: "Casa" } }, brand);
    expect(en.subject).toBe("New iCal calendar conflict · Casa Marian");
    expect(en.text).toContain("Sent by Casa Marian");
  });
  it("never mentions the product unless 'powered by' is on", () => {
    const off = renderEmail({ template: "icalFeedDown", lang: "es", props: { channel: "booking" } }, brand);
    expect(off.html).not.toContain("Saywa Direct");
    expect(off.text).not.toContain("Saywa Direct");
    const on = renderEmail({ template: "icalFeedDown", lang: "es", props: { channel: "booking" } }, { ...brand, poweredBy: true });
    expect(on.html).toContain("Con tecnología de Saywa Direct.");
    expect(on.text).toContain("Con tecnología de Saywa Direct.");
    expect(renderEmail({ template: "test", lang: "en", props: {} }, { ...brand, poweredBy: true }).text).toContain("Powered by Saywa Direct.");
  });
  it("does not reinterpret placeholders written inside the brand", () => {
    const email = renderEmail({ template: "test", lang: "es", props: { name: "Ana" } }, { name: "Casa {name} {unit}", poweredBy: false });
    expect(email.subject).toBe("Correo de prueba · Casa {name} {unit}");
    expect(email.text).toContain("Enviado por Casa {name} {unit}");
  });
  it("escapes the brand in HTML", () => {
    const email = renderEmail({ template: "test", lang: "es", props: {} }, { name: "<script>alert(1)</script>", poweredBy: false });
    expect(email.html).not.toContain("<script>alert(1)</script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
  it("keeps the default brand when none is given", () => {
    expect(renderEmail({ template: "test", lang: "es", props: {} }).subject).toBe("Correo de prueba · Saywa Direct");
  });
});

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
    expect(() => renderEmail({ template: "test", lang: "es", props: { name: 42 } as never })).toThrow(ZodError);
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

  it("shortens a long unit name instead of rejecting the alert", () => {
    const long = renderEmail({ template: "icalConflict", lang: "es", props: { ...props, unitName: "Casa ".repeat(40) } });
    expect(long.subject).toBeTruthy();
    expect(long.html).not.toContain("Casa ".repeat(30));
  });

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
