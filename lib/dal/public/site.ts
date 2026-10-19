import "server-only";
import { cache } from "react";
import { getSupabaseAnon } from "@/lib/supabase/anon";
import { env } from "@/lib/env";

export type Site = { slug: string };

// Same host → siteIdentifier stripping proxy.ts does, for the two root-level
// files (app/sitemap.ts, app/robots.ts) that need it but can't share
// proxy.ts's copy — proxy.ts deliberately stays DB-free and self-contained
// (ADR-0001), so duplicating this one small piece of string logic there is
// the right call; these two files are ordinary route modules, so they share
// this instead of duplicating it a third time.
export function siteIdentifierFromHost(host: string): string {
  return host.endsWith(`.${env.ROOT_DOMAIN}`) ? host.slice(0, -(env.ROOT_DOMAIN.length + 1)) : host;
}

// Resolves the `[host]` route param (a bare subdomain like "saywa-lodges",
// or a full custom domain) to the tenant's slug. proxy.ts computes which
// one it is but never queries the DB itself (ADR-0001) — this is where
// that actually happens, and only here.
//
// Two separate .eq() queries, not .or("subdomain.eq.<host>,custom_domain.eq.<host>"):
// `host` comes straight from the request's Host header (attacker-controlled),
// and PostgREST's .or() takes a raw filter-syntax string with no escaping —
// a comma or dot in a crafted Host value could inject extra filter clauses.
// .eq() is properly parameterized and has no such issue.
export const getSiteByHost = cache(async (host: string): Promise<Site | null> => {
  const supabase = getSupabaseAnon();
  const [bySubdomain, byCustomDomain] = await Promise.all([
    supabase.from("properties").select("slug").eq("subdomain", host).maybeSingle(),
    supabase.from("properties").select("slug").eq("custom_domain", host).maybeSingle(),
  ]);

  if (bySubdomain.error) console.error("getSiteByHost: subdomain lookup failed:", bySubdomain.error);
  if (byCustomDomain.error) console.error("getSiteByHost: custom_domain lookup failed:", byCustomDomain.error);

  const data = bySubdomain.data ?? byCustomDomain.data;
  if (!data) return null;
  return { slug: data.slug };
});

// Vercel/most hosts terminate TLS in front of the app, so there's no
// request-level signal here for the real external protocol — good enough
// for metadata URLs (SEO), where dev output is never actually crawled.
export function getSiteUrl(host: string): string {
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  return `${protocol}://${host}`;
}
