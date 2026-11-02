import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { locales, defaultLocale } from "./dictionaries";
import { env } from "./lib/env";
import { decideRoute, shouldRefreshSession } from "./lib/domain/host-routing";
import { buildCsp, generateNonce } from "./lib/security/csp";

// Host and path decisions live in lib/domain/host-routing.ts (pure, unit-tested); this file only applies them.

// ─── Locale routing ──────────────────────────────────────────────────────────
function getLocale(request: NextRequest): string {
  const acceptLang = request.headers.get("accept-language") ?? "";
  const preferred = acceptLang.split(",")[0].trim().split("-")[0].toLowerCase();
  return locales.includes(preferred as never) ? preferred : defaultLocale;
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
// Per-request nonce. Next reads it back from the CSP header of the *forwarded* request and stamps it on its
// scripts/styles, so every NextResponse.next/rewrite below must forward these headers (a redirect/error response
// has no render, so it only needs the response header). Pure header plumbing: it decides nothing.
const CSP_HEADER = "content-security-policy";
const CSP_REPORT_ONLY_HEADER = "content-security-policy-report-only";

function cspHeaderName() {
  return env.CSP_REPORT_ONLY === "1" ? CSP_REPORT_ONLY_HEADER : CSP_HEADER;
}

// Built after refreshSession so the copied headers carry the refreshed session cookie that request.cookies.set
// wrote into them: the render sees the refreshed session instead of the stale cookie it arrived with.
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
// Never queries the DB (ADR-0001): it only matches the host against ROOT_DOMAIN. The actual host → property
// lookup happens in lib/dal/public/site.ts, inside the page itself, which 404s for a host nothing matches.
async function route(request: NextRequest, nonce: string, csp: string) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";

  const decision = decideRoute({ host, pathname, rootDomain: env.ROOT_DOMAIN, mode: env.DEPLOYMENT_MODE });
  if (decision.type === "invalid-host") return new NextResponse("Invalid request", { status: 400 });
  if (decision.type === "not-found") return new NextResponse("Not found", { status: 404 });

  const refresh = shouldRefreshSession({ host, rootDomain: env.ROOT_DOMAIN, mode: env.DEPLOYMENT_MODE })
    ? await refreshSession(request)
    : { pendingCookies: [], pendingHeaders: {} };

  // The dashboard's own root path → the dashboard home. Every other path on that host (/login, /forgot-password,
  // …) already exists at that exact top-level path, so it needs no rewrite at all.
  if (decision.type === "rewrite-panel-root") {
    return applySessionRefresh(NextResponse.rewrite(new URL("/app", request.url), forwardInit(request, nonce, csp)), refresh);
  }

  // Native routes (landing, dashboard, auth, api, special files). forwardInit forwards the request headers
  // refreshSession already mutated via request.cookies.set — NextResponse.next() with no argument would silently
  // discard that mutation.
  if (decision.type === "pass") {
    return applySessionRefresh(NextResponse.next(forwardInit(request, nonce, csp)), refresh);
  }

  // A tenant / client site: locale-detect and redirect, then rewrite into /sites/[host]/[lang]/… once the locale
  // prefix is present.
  const matchedLocale = locales.find((l) => pathname.startsWith(`/${l}/`) || pathname === `/${l}`);
  const lang = matchedLocale ?? getLocale(request);

  if (!matchedLocale) {
    request.nextUrl.pathname = `/${lang}${pathname}`;
    return applySessionRefresh(NextResponse.redirect(request.nextUrl), refresh);
  }

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = `/sites/${encodeURIComponent(decision.siteIdentifier)}${pathname}`;
  return applySessionRefresh(NextResponse.rewrite(rewriteUrl, forwardInit(request, nonce, csp)), refresh);
}

export const config = {
  matcher: ["/((?!_next|images|favicon.ico).*)"],
};
