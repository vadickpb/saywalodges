import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { locales, defaultLocale } from "./dictionaries";
import { env } from "./lib/env";

// ─── Admin Basic Auth ────────────────────────────────────────────────────────
// Protected paths: the UI and the API routes it calls.
const ADMIN_PATHS = ["/admin", "/api/admin"];

function requiresAuth(pathname: string) {
  return ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// ─── Shared-across-tenants routes ────────────────────────────────────────────
// Dashboard, auth and legacy admin pages (CLAUDE.md: dashboard is
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

function isAuthorized(request: NextRequest): boolean {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Basic ")) return false;

  const decoded = Buffer.from(auth.slice(6), "base64").toString("utf-8");
  const colon = decoded.indexOf(":");
  if (colon === -1) return false;

  const user = decoded.slice(0, colon);
  const pass = decoded.slice(colon + 1);

  const expectedUser = process.env.ADMIN_USER ?? "";
  const expectedPass = process.env.ADMIN_PASSWORD ?? "";

  // Constant-time comparison to avoid timing attacks
  if (!expectedUser || !expectedPass) return false;
  const userOk = user.length === expectedUser.length && user === expectedUser;
  const passOk = pass.length === expectedPass.length && pass === expectedPass;
  return userOk && passOk;
}

function unauthorizedResponse() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Saywa Admin", charset="UTF-8"',
    },
  });
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
  if (host === env.ROOT_DOMAIN) return { kind: "landing" };
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

// ─── Main proxy ──────────────────────────────────────────────────────────────
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";

  // 1. Reject anything that isn't a plausible hostname outright — see
  // isValidHost's comment. Nothing below this point is safe to do with an
  // unvalidated Host value.
  if (!isValidHost(host)) {
    return new NextResponse("Invalid request", { status: 400 });
  }

  // 2. /sites/* only ever exists as an internal rewrite target (step 6
  // below) — it must never be reachable as a literal incoming path, on any
  // host, or the bare ROOT_DOMAIN's unfiltered pass-through (step 5) would
  // let anyone browse any tenant directly under the platform's own domain.
  if (pathname === "/sites" || pathname.startsWith("/sites/")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const isPlatformHost = host === env.ROOT_DOMAIN || host === `app.${env.ROOT_DOMAIN}`;

  // 3. Guard admin routes — before any locale/host logic. Not reachable on
  // a tenant's own host (subdomain or custom domain): there is one shared
  // admin panel, not one per tenant.
  if (requiresAuth(pathname)) {
    if (!isPlatformHost) return new NextResponse("Not found", { status: 404 });
    if (!isAuthorized(request)) return unauthorizedResponse();
    return NextResponse.next();
  }

  const refresh = await refreshSession(request);

  // 4. app.<ROOT_DOMAIN>'s own root path → the dashboard home. Every other
  // path on this host (/login, /forgot-password, …) already exists at
  // that exact top-level path, so it needs no rewrite at all — see step 5.
  if (host === `app.${env.ROOT_DOMAIN}` && pathname === "/") {
    return applySessionRefresh(NextResponse.rewrite(new URL("/app", request.url)), refresh);
  }

  // 5. Shared-across-tenants routes: no locale rewrite, no host rewrite —
  // and, like the admin guard above, not reachable on a tenant's own host.
  // One shared dashboard/login/auth flow, not one per tenant — serving it
  // on a tenant's custom domain would let that tenant harvest session
  // cookies and admin Basic Auth credentials scoped to their own domain.
  // `{ request }` forwards the request object refreshSession already
  // mutated via request.cookies.set, so the render sees the refreshed
  // session instead of the stale cookie it arrived with —
  // NextResponse.next() with no argument would silently discard that
  // mutation and forward the original, unmodified request.
  if (isNoRewritePath(pathname)) {
    if (!isPlatformHost) return new NextResponse("Not found", { status: 404 });
    return applySessionRefresh(NextResponse.next({ request }), refresh);
  }

  // 6. Everything else: resolve the host, then locale-detect/redirect
  // exactly as before. On the bare ROOT_DOMAIN ("landing"), stop here —
  // no rewrite, whatever exists at this path under app/(platform) serves
  // it directly. Otherwise, rewrite into /sites/[host]/[lang]/... once the
  // locale prefix is present (the page itself resolves [host] to a
  // property and 404s if nothing matches — this proxy never queries the
  // DB, per ADR-0001).
  const hostRoute = resolveHost(host);
  if (hostRoute.kind === "landing") {
    return applySessionRefresh(NextResponse.next(), refresh);
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
  return applySessionRefresh(NextResponse.rewrite(rewriteUrl), refresh);
}

export const config = {
  matcher: ["/((?!_next|images|favicon.ico).*)"],
};
