import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PAYMENT_PROVIDER_SOURCES,
  SONNER_STYLE_HASH,
  buildCsp,
  generateNonce,
  staticSecurityHeaders,
  toExactOrigin,
} from "./csp";

const SUPABASE = "https://abcd.supabase.co";
const prod = (nonce = "NONCE") => buildCsp({ nonce, isDev: false, supabaseUrl: SUPABASE });
const dev = () => buildCsp({ nonce: "NONCE", isDev: true, supabaseUrl: "http://127.0.0.1:54321" });
const directive = (csp: string, name: string) =>
  csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("generateNonce", () => {
  it("is base64 of 16 random bytes and differs per call", () => {
    const a = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(new Set(Array.from({ length: 50 }, generateNonce)).size).toBe(50);
  });
});

describe("buildCsp (production)", () => {
  it("scripts: nonce + strict-dynamic, never unsafe-inline/unsafe-eval anywhere", () => {
    const csp = prod();
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'nonce-NONCE' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(directive(csp, "script-src")).not.toContain("unsafe-inline");
    expect(directive(csp, "style-src")).toBe("style-src 'self' 'nonce-NONCE'");
    expect(directive(csp, "style-src-elem")).not.toContain("unsafe-inline");
  });

  it("only style ATTRIBUTES may be inline (documented in ADR-0008)", () => {
    const unsafe = prod().split("; ").filter((d) => d.includes("'unsafe-inline'"));
    expect(unsafe).toEqual(["style-src-attr 'unsafe-inline'"]);
  });

  it("locks down plugins, base, forms, framing and mixed content", () => {
    const csp = prod();
    for (const d of ["object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'", "frame-src 'none'", "default-src 'self'"]) {
      expect(csp.split("; ")).toContain(d);
    }
    expect(csp.endsWith("upgrade-insecure-requests")).toBe(true);
  });

  it("allows exactly the Supabase origin for connect and img — no wildcard, no bare scheme", () => {
    const csp = prod();
    expect(directive(csp, "connect-src")).toBe(`connect-src 'self' ${SUPABASE}`);
    expect(directive(csp, "img-src")).toBe(`img-src 'self' data: blob: ${SUPABASE}`);
    expect(csp).not.toMatch(/\*|\shttps:(\s|;|$)|\shttp:(\s|;|$)/);
  });

  it("allows the sonner stylesheet by hash on style elements only", () => {
    expect(directive(prod(), "style-src-elem")).toContain(`'${SONNER_STYLE_HASH}'`);
    expect(directive(prod(), "style-src")).not.toContain("sha256");
  });

  it("has no payment provider origins until one is integrated", () => {
    expect(Object.values(PAYMENT_PROVIDER_SOURCES).flat()).toEqual([]);
    expect(prod()).not.toMatch(/mercadopago|mercadolibre/i);
  });

  it("embeds the given nonce and a different one changes the header", () => {
    expect(prod("AAA")).toContain("'nonce-AAA'");
    expect(prod("AAA")).not.toBe(prod("BBB"));
  });
});

describe("buildCsp (development)", () => {
  it("adds unsafe-eval to scripts and unsafe-inline styles (no nonce next to it), without upgrade-insecure-requests", () => {
    const csp = dev();
    expect(directive(csp, "script-src")).toContain("'unsafe-eval'");
    expect(directive(csp, "style-src")).toBe("style-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(directive(csp, "connect-src")).toContain("http://127.0.0.1:54321");
  });
});

describe("toExactOrigin", () => {
  it("normalizes to an origin", () => {
    expect(toExactOrigin("https://abcd.supabase.co/rest/v1")).toBe("https://abcd.supabase.co");
    expect(toExactOrigin("http://localhost:54321")).toBe("http://localhost:54321");
  });
  it.each(["*", "https://*.supabase.co", "https:", "data:", "http://evil.example", "javascript:alert(1)", "https://u:p@a.example", "not a url"])(
    "rejects %s",
    (value) => {
      expect(() => toExactOrigin(value)).toThrow();
    },
  );
});

describe("sonner style hash", () => {
  it("matches the stylesheet node_modules/sonner injects (update SONNER_STYLE_HASH after upgrading sonner)", () => {
    const src = readFileSync("node_modules/sonner/dist/index.mjs", "utf8");
    const calls = [...src.matchAll(/__insertCSS\(("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)\)/g)];
    expect(calls).toHaveLength(1);
    const css: string = JSON.parse(calls[0][1].startsWith("`") ? JSON.stringify(calls[0][1].slice(1, -1)) : calls[0][1]);
    expect(`sha256-${createHash("sha256").update(css).digest("base64")}`).toBe(SONNER_STYLE_HASH);
  });
});

describe("staticSecurityHeaders", () => {
  const map = (isProd: boolean) => Object.fromEntries(staticSecurityHeaders(isProd).map((h) => [h.key, h.value]));
  it("keeps the pre-existing headers", () => {
    expect(map(false)).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    });
  });
  it("sends HSTS only in production", () => {
    expect(map(false)["Strict-Transport-Security"]).toBeUndefined();
    expect(map(true)["Strict-Transport-Security"]).toBe("max-age=63072000; includeSubDomains");
  });
});
