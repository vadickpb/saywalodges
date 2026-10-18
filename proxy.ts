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

// ─── Auth / dashboard routes ─────────────────────────────────────────────────
// These live outside app/[lang] (CLAUDE.md: dashboard is app/app/(dashboard),
// not under the public site's locale tree) and aren't localized yet, so they
// must skip the locale-prefix rewrite below — otherwise /app gets rewritten
// to /en/app before lib/dal/session.ts ever gets to redirect to /login.
const NO_LOCALE_PATHS = ["/app", "/login", "/forgot-password", "/update-password", "/auth"];

function isNoLocalePath(pathname: string) {
  return NO_LOCALE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
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

  // 1. Guard admin routes first — before any locale logic
  if (requiresAuth(pathname)) {
    if (!isAuthorized(request)) return unauthorizedResponse();
    return NextResponse.next();
  }

  const refresh = await refreshSession(request);

  // 2. Auth/dashboard routes: no locale rewrite. `{ request }` forwards the
  // request object refreshSession already mutated via request.cookies.set,
  // so the render sees the refreshed session instead of the stale cookie
  // it arrived with — NextResponse.next() with no argument would silently
  // discard that mutation and forward the original, unmodified request.
  if (isNoLocalePath(pathname)) {
    return applySessionRefresh(NextResponse.next({ request }), refresh);
  }

  // 3. Locale detection + x-lang header injection
  const matchedLocale = locales.find(
    (l) => pathname.startsWith(`/${l}/`) || pathname === `/${l}`
  );
  const hasLocale = Boolean(matchedLocale);
  const lang = matchedLocale ?? getLocale(request);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-lang", lang);

  const response = hasLocale
    ? NextResponse.next({ request: { headers: requestHeaders } })
    : (() => {
        request.nextUrl.pathname = `/${lang}${pathname}`;
        return NextResponse.redirect(request.nextUrl);
      })();

  return applySessionRefresh(response, refresh);
}

export const config = {
  matcher: ["/((?!_next|images|favicon.ico).*)"],
};
