import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { locales, defaultLocale } from "./dictionaries";

function getLocale(request: NextRequest): string {
  const acceptLang = request.headers.get("accept-language") ?? "";
  const preferred = acceptLang.split(",")[0].trim().split("-")[0].toLowerCase();
  return locales.includes(preferred as never) ? preferred : defaultLocale;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const matchedLocale = locales.find(
    (l) => pathname.startsWith(`/${l}/`) || pathname === `/${l}`
  );
  const hasLocale = Boolean(matchedLocale);
  const lang = matchedLocale ?? getLocale(request);

  // Forward the active locale as a request header so the root layout
  // can set <html lang="..."> correctly on the server.
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
