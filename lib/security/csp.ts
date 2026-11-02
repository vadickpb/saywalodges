// Content-Security-Policy (SD-701). Pure: no I/O and no env access, so every directive is unit-testable.
// proxy.ts generates a fresh nonce per request and calls buildCsp(); Next reads the nonce back from the
// request's CSP header and stamps it on its own scripts/styles (see docs/adr/0011-csp-and-security-headers.md).

// sonner (dashboard toasts) injects ONE <style> element at import time and exposes no nonce option, so
// style-src-elem allows exactly that stylesheet by hash. lib/security/csp.test.ts recomputes the hash from
// node_modules/sonner and fails when a sonner upgrade changes it — update the constant then.
export const SONNER_STYLE_HASH = "sha256-StEaX+se6YS7pqjzrzMIA0KaX9zF/8zAhvQXZAe5epY=";

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

// Only a bare https origin (or, for local Supabase, http://localhost|127.0.0.1) is ever allowed as an extra
// source: no wildcards, no schemes alone ("https:", "data:"), no paths, no userinfo. Anything else throws, so a
// typo in env can't silently open a directive to arbitrary hosts.
export function toExactOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`CSP source is not an absolute URL: ${value}`);
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error(`CSP source must be https (or local http): ${value}`);
  }
  if (url.hostname.includes("*") || url.username || url.password) {
    throw new Error(`CSP source must be an exact origin: ${value}`);
  }
  return url.origin;
}

// Future payment SDKs (Mercado Pago) are NOT allowed yet: SD-701 doesn't assume an API that isn't integrated.
// The ticket that integrates one adds its exact, documented origins here — never a wildcard — with a test.
export const PAYMENT_PROVIDER_SOURCES = {
  script: [] as readonly string[],
  connect: [] as readonly string[],
  frame: [] as readonly string[],
  img: [] as readonly string[],
} as const;

export interface CspOptions {
  nonce: string;
  isDev: boolean;
  // Supabase project URL (Auth/REST from the browser client, public Storage images).
  supabaseUrl: string;
}

export function buildCsp({ nonce, isDev, supabaseUrl }: CspOptions): string {
  const supabase = toExactOrigin(supabaseUrl);
  const payments = PAYMENT_PROVIDER_SOURCES;
  const n = `'nonce-${nonce}'`;
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    // 'strict-dynamic' lets the nonce'd Next bootstrap load its chunks; host sources are ignored by it.
    // 'unsafe-eval' only in dev (React debug stack reconstruction), never in production.
    ["script-src", ["'self'", n, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : []), ...payments.script]],
    // Dev needs 'unsafe-inline' for HMR style injection; a nonce next to it would disable it, so dev omits the nonce.
    ["style-src", isDev ? ["'self'", "'unsafe-inline'"] : ["'self'", n]],
    ["style-src-elem", isDev ? ["'self'", "'unsafe-inline'"] : ["'self'", n, `'${SONNER_STYLE_HASH}'`]],
    // style="" ATTRIBUTES (SD-209 tenant theme vars on <body>, Radix/sonner positioning) can't carry a nonce.
    // Attribute-only: it grants no script execution and no <style> element injection. See ADR-0011.
    ["style-src-attr", ["'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", supabase, ...payments.img]],
    ["font-src", ["'self'"]],
    ["connect-src", ["'self'", supabase, ...payments.connect]],
    ["frame-src", payments.frame.length ? [...payments.frame] : ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    // Matches the existing X-Frame-Options: SAMEORIGIN.
    ["frame-ancestors", ["'self'"]],
  ];
  const parts = directives.map(([name, sources]) => `${name} ${sources.join(" ")}`);
  if (!isDev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

// Not CSP-specific and nonce-free: applied once through next.config.ts headers() to every response.
export function staticSecurityHeaders(isProd: boolean): { key: string; value: string }[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    // allow-popups keeps window.open()/payment popups working while isolating the opener from cross-origin pages.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
  ];
}
