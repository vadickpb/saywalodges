import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { locales, defaultLocale } from "./dictionaries";
import { env } from "./lib/env";
import { buildCsp, generateNonce } from "./lib/security/csp";

// ─── Shared-across-tenants routes ────────────────────────────────────────────
// Dashboard and auth pages (CLAUDE.md: dashboard is
// app/app/(dashboard); the rest live in the app/(platform) route group) are
// the same for every tenant — one login, one dashboard — not a tenant's own
// content. They skip both the locale-prefix rewrite and the host-based
// /sites/[host] rewrite below, same on any host. Root-level special files
// (sitemap.xml, robots.txt) join them: they read the host themselves via
// headers() to build per-tenant URLs and must never be rewritten into
// /sites/... first.
const NO_REWRITE_PATHS = [
  "/app",
  "/login",
  "/forgot-password",
  "/update-password",
  "/auth",
  "/sitemap.xml",
  "/robots.txt",
];

function isNoRewritePath(pathname: string) {
  return NO_REWRITE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// ─── Locale routing ──────────────────────────────────────────────────────────
function getLocale(request: NextRequest): string {
  const acceptLang = request.headers.get("accept-language") ?? "";
  const preferred = acceptLang.split(",")[0].trim().split("-")[0].toLowerCase();
  return locales.includes(preferred as never) ? preferred : defaultLocale;
}

// ─── Host-based tenant resolution (ADR-0001) ─────────────────────────────────
// Never queries the DB — just string matching against ROOT_DOMAIN. The
// actual host → property lookup happens in lib/dal/public/site.ts, inside
// the page itself, which 404s for a host nothing matches.

// Node's HTTP parser accepts far more in a raw Host header value than a
// real hostname allows (it's attacker-controlled: nothing stops a non-browser
// client from sending any header value) — without this check, something
// like "x/../../app" could ride through resolveHost() and land in
// `/sites/${siteIdentifier}${pathname}`, letting a crafted Host rewrite the
// path outside of /sites entirely. Reject anything that isn't a plausible
// hostname[:port] before it's used for anything.
const VALID_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/i;

function isValidHost(host: string): boolean {
  return VALID_HOST.test(host);
}

type HostRoute =
  | { kind: "landing" }
  | { kind: "site"; siteIdentifier: string };

function resolveHost(host: string): HostRoute {
  if (host === env.ROOT_DOMAIN || host === `app.${env.ROOT_DOMAIN}`) return { kind: "landing" };
  if (host.endsWith(`.${env.ROOT_DOMAIN}`)) {
    return { kind: "site", siteIdentifier: host.slice(0, -(env.ROOT_DOMAIN.length + 1)) };
  }
  // Doesn't match ROOT_DOMAIN at all — assumed a tenant's own custom domain
  // (SD-604). Not validated against the DB here; the page 404s if no
  // property's custom_domain matches.
  return { kind: "site", siteIdentifier: host };
}

// ─── Supabase session refresh ────────────────────────────────────────────────
// Cookie plumbing only (CLAUDE.md exception for SD-103): this never inspects
// the session to decide anything — no redirect, no route blocking. It exists
// solely because @supabase/ssr's own docs call the middleware pattern
// mandatory: without it, a token refresh that happens while rendering a
// Server Component can't be written back to cookies (they're read-only
// there), causing silent, hard-to-debug session loss. Real authorization
// stays in lib/dal.
async function refreshSession(request: NextRequest) {
  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];
  let pendingHeaders: Record<string, string> = {};

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        pendingCookies.push(...cookiesToSet);
        // Cache-Control/Pragma on the first cookie write — must not be
        // dropped by a CDN/reverse proxy that would otherwise cache one
        // visitor's session cookie and serve it to another.
        pendingHeaders = headers;
      },
    },
  });

  try {
    await supabase.auth.getClaims();
  } catch (error) {
    // A Supabase outage must never break host/locale rewriting for every
    // visitor, including anonymous ones on the public tenant sites.
    console.error("proxy: session refresh failed", error);
  }

  return { pendingCookies, pendingHeaders };
}

function applySessionRefresh(
  response: NextResponse,
  { pendingCookies, pendingHeaders }: { pendingCookies: { name: string; value: string; options: CookieOptions }[]; pendingHeaders: Record<string, string> }
) {
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options);
  }
  for (const [key, value] of Object.entries(pendingHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

// ─── CSP (SD-701) ────────────────────────────────────────────────────────────
// Per-request nonce. Next reads it back from the CSP header of the *forwarded*
// request and stamps it on its scripts/styles, so every NextResponse.next/rewrite
// below must forward these headers (a redirect/error response has no render, so
// it only needs the response header). Pure header plumbing: it decides nothing.
const CSP_HEADER = "content-security-policy";
const CSP_REPORT_ONLY_HEADER = "content-security-policy-report-only";

function cspHeaderName() {
  return env.CSP_REPORT_ONLY === "1" ? CSP_REPORT_ONLY_HEADER : CSP_HEADER;
}

// Built after refreshSession so the copied headers carry the refreshed
// session cookie that request.cookies.set wrote into them.
function forwardInit(request: NextRequest, nonce: string, csp: string) {
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set(cspHeaderName(), csp);
  return { request: { headers } };
}

export async function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
  });
  const response = await route(request, nonce, csp);
  response.headers.set(cspHeaderName(), csp);
  return response;
}

// ─── Routing ─────────────────────────────────────────────────────────────────
async function route(request: NextRequest, nonce: string, csp: string) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";

  // 1. Reject anything that isn't a plausible hostname outright — see
  // isValidHost's comment. Nothing below this point is safe to do with an
  // unvalidated Host value.
  if (!isValidHost(host)) {
    return new NextResponse("Invalid request", { status: 400 });
  }

  // 2. /sites/* only ever exists as an internal rewrite target (step 5
  // below) — it must never be reachable as a literal incoming path, on any
  // host, or the platform hosts' pass-through (step 5) would
  // let anyone browse any tenant directly under the platform's own domain.
  if (pathname === "/sites" || pathname.startsWith("/sites/")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const isPlatformHost = host === env.ROOT_DOMAIN || host === `app.${env.ROOT_DOMAIN}`;

  const refresh = await refreshSession(request);

  // 3. app.<ROOT_DOMAIN>'s own root path → the dashboard home. Every other
  // path on this host (/login, /forgot-password, …) already exists at
  // that exact top-level path, so it needs no rewrite at all — see step 4.
  if (host === `app.${env.ROOT_DOMAIN}` && pathname === "/") {
    return applySessionRefresh(NextResponse.rewrite(new URL("/app", request.url), forwardInit(request, nonce, csp)), refresh);
  }

  // 4. Shared-across-tenants routes: no locale rewrite, no host rewrite —
  // and not reachable on a tenant's own host.
  // One shared dashboard/login/auth flow, not one per tenant — serving it
  // on a tenant's custom domain would let that tenant harvest session
  // cookies scoped to their own domain.
  // forwardInit copies request.headers AFTER refreshSession mutated them via
  // request.cookies.set, so the render sees the refreshed session instead of
  // the stale cookie it arrived with — NextResponse.next() with no argument
  // would silently discard that mutation and forward the original request.
  if (isNoRewritePath(pathname)) {
    if (!isPlatformHost) return new NextResponse("Not found", { status: 404 });
    return applySessionRefresh(NextResponse.next(forwardInit(request, nonce, csp)), refresh);
  }

  // 5. Everything else: resolve the host, then locale-detect/redirect
  // for tenant sites. On ROOT_DOMAIN and app.<ROOT_DOMAIN>, use native
  // routes (including native 404s). Whatever exists at this path under
  // app/(platform) or app/app serves it directly. Otherwise, rewrite into /sites/[host]/[lang]/... once the
  // locale prefix is present (the page itself resolves [host] to a
  // property and 404s if nothing matches — this proxy never queries the
  // DB, per ADR-0001).
  const hostRoute = resolveHost(host);
  if (hostRoute.kind === "landing") {
    return applySessionRefresh(NextResponse.next(forwardInit(request, nonce, csp)), refresh);
  }

  const matchedLocale = locales.find(
    (l) => pathname.startsWith(`/${l}/`) || pathname === `/${l}`
  );
  const hasLocale = Boolean(matchedLocale);
  const lang = matchedLocale ?? getLocale(request);

  if (!hasLocale) {
    request.nextUrl.pathname = `/${lang}${pathname}`;
    return applySessionRefresh(NextResponse.redirect(request.nextUrl), refresh);
  }

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = `/sites/${encodeURIComponent(hostRoute.siteIdentifier)}${pathname}`;
  return applySessionRefresh(NextResponse.rewrite(rewriteUrl, forwardInit(request, nonce, csp)), refresh);
}

export const config = {
  matcher: ["/((?!_next|images|favicon.ico).*)"],
};
