// Host-based routing decisions (ADR 0001, ADR 0010). Pure string logic: no I/O, no database.
// proxy.ts applies these decisions; nothing here authorizes anything (that lives in lib/dal).
//
// Two deployment modes:
//  * "platform" (default, how Saywa runs today): ROOT_DOMAIN and app.<ROOT_DOMAIN> are the platform hosts
//    (landing + dashboard/auth/api); <sub>.<ROOT_DOMAIN> and any other host are tenant sites.
//  * "installation" (ADR 0010, one installation per client): ROOT_DOMAIN IS the client's public site;
//    app.<ROOT_DOMAIN> serves the panel, auth and every /api/* route; any other host is unknown (404).

export type DeploymentMode = "platform" | "installation";

// Dashboard and auth pages are shared, not tenant content: they skip the locale and host rewrites and are
// never reachable on a tenant's own host (serving them there would let that tenant harvest session cookies
// scoped to its own domain). Root-level special files (sitemap.xml, robots.txt) are in the list because they
// read the host themselves and must never be rewritten into /sites/... first.
export const NO_REWRITE_PATHS = ["/app", "/login", "/forgot-password", "/update-password", "/auth", "/sitemap.xml", "/robots.txt"] as const;

// Files that read the Host header themselves and are valid on a public site host in installation mode.
const SITE_ROOT_FILES = ["/sitemap.xml", "/robots.txt"] as const;

const matchesPath = (pathname: string, paths: readonly string[]) =>
  paths.some((p) => pathname === p || pathname.startsWith(p + "/"));

export const isNoRewritePath = (pathname: string) => matchesPath(pathname, NO_REWRITE_PATHS);

// Node's HTTP parser accepts far more in a raw Host header than a real hostname allows (it is
// attacker-controlled): without this check something like "x/../../app" could ride through into
// `/sites/${siteIdentifier}${pathname}` and rewrite the path outside /sites. Reject anything that is
// not a plausible hostname[:port] before it is used for anything.
const VALID_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/i;
export const isValidHost = (host: string): boolean => VALID_HOST.test(host);

export type RouteDecision =
  | { type: "invalid-host" } // 400
  | { type: "not-found" } // 404
  | { type: "pass" } // native routes (app/app, app/(platform), app/api…)
  | { type: "rewrite-panel-root" } // "/" → "/app"
  | { type: "site"; siteIdentifier: string }; // tenant site: locale redirect, then rewrite to /sites/[host]/…

export function decideRoute(input: { host: string; pathname: string; rootDomain: string; mode: DeploymentMode }): RouteDecision {
  const { host, pathname, rootDomain, mode } = input;
  const panelHost = `app.${rootDomain}`;

  if (!isValidHost(host)) return { type: "invalid-host" };

  // /sites/* only exists as an internal rewrite target: never reachable as a literal incoming path, on any host.
  if (pathname === "/sites" || pathname.startsWith("/sites/")) return { type: "not-found" };

  if (mode === "installation") {
    if (host === panelHost) {
      // The panel host serves everything natively: panel, auth, recovery and every /api/* route.
      return pathname === "/" ? { type: "rewrite-panel-root" } : { type: "pass" };
    }
    if (host !== rootDomain) return { type: "not-found" }; // www, subdomains, anything else: no database lookup
    // The client's public site. Panel, auth and API routes must not exist here.
    if (isNoRewritePath(pathname) && !matchesPath(pathname, SITE_ROOT_FILES)) return { type: "not-found" };
    if (pathname === "/api" || pathname.startsWith("/api/")) return { type: "not-found" };
    if (matchesPath(pathname, SITE_ROOT_FILES)) return { type: "pass" };
    // The site is found by custom_domain = the root domain (set by the install script, SD-1002).
    return { type: "site", siteIdentifier: host };
  }

  // ── platform mode: exactly the behavior before SD-1001 ──────────────────────
  const isPlatformHost = host === rootDomain || host === panelHost;
  if (host === panelHost && pathname === "/") return { type: "rewrite-panel-root" };
  if (isNoRewritePath(pathname)) return isPlatformHost ? { type: "pass" } : { type: "not-found" };
  if (isPlatformHost) return { type: "pass" }; // landing and dashboard use native routes (and native 404s)
  if (host.endsWith(`.${rootDomain}`)) return { type: "site", siteIdentifier: host.slice(0, -(rootDomain.length + 1)) };
  // Not under ROOT_DOMAIN at all: assumed a tenant's own custom domain; the page 404s if nothing matches.
  return { type: "site", siteIdentifier: host };
}

// Public host of a property's website: where the "Ver mi sitio" link and shared links point.
export function siteHostFor(input: {
  mode: DeploymentMode;
  rootDomain: string;
  subdomain: string;
  customDomain: string | null;
}): string {
  if (input.mode === "installation") return input.rootDomain;
  return input.customDomain?.trim() || `${input.subdomain}.${input.rootDomain}`;
}
