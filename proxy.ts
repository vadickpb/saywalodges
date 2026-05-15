import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { locales, defaultLocale } from "./dictionaries";

// ─── Admin Basic Auth ────────────────────────────────────────────────────────
// Protected paths: the UI and the API routes it calls.
const ADMIN_PATHS = ["/admin", "/api/photos", "/api/upload"];

function requiresAuth(pathname: string) {
  return ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
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

// ─── Main proxy ──────────────────────────────────────────────────────────────
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Guard admin routes first — before any locale logic
  if (requiresAuth(pathname)) {
    if (!isAuthorized(request)) return unauthorizedResponse();
    return NextResponse.next();
  }

  // 2. Locale detection + x-lang header injection
  const matchedLocale = locales.find(
    (l) => pathname.startsWith(`/${l}/`) || pathname === `/${l}`
  );
  const hasLocale = Boolean(matchedLocale);
  const lang = matchedLocale ?? getLocale(request);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-lang", lang);

  if (hasLocale) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  request.nextUrl.pathname = `/${lang}${pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  matcher: ["/((?!_next|images|favicon.ico).*)"],
};
