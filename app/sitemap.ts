import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getSiteByHost, getSiteUrl, siteIdentifierFromHost } from "@/lib/dal/public/site";
import { getProperty } from "@/lib/dal/public/property";
import { getShowcaseUnits } from "@/lib/dal/public/showcase-units";
import { SITE_URL } from "@/config/site";
import { env } from "@/lib/env";
import { languageAlternates } from "@/lib/domain/seo";

// Reads the request's host (not a param — this file is a root-level
// special route, outside app/sites/[host]) so it's per-tenant, per ADR-0001.
// Using headers() here opts this out of the default static caching (Next.js
// docs: "sitemap.js is cached by default unless it uses a Request-time
// API") — intentional, this must vary by host.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (env.DEPLOYMENT_MODE === "vendor") {
    return [{ url: SITE_URL, changeFrequency: "monthly", priority: 1 }];
  }

  const host = (await headers()).get("host") ?? "";
  const site = await getSiteByHost(siteIdentifierFromHost(host));
  if (!site) return [];

  const baseUrl = getSiteUrl(host);
  const now = new Date();
  // SD-1125: every page lists its other-language version (hreflang). /cotizar is not listed: the page is noindex on purpose.
  const both = (path: string, priority: number, changeFrequency: "weekly" | "monthly", images?: string[]): MetadataRoute.Sitemap =>
    (["es", "en"] as const).map((lang) => ({
      url: `${baseUrl}/${lang}${path}`, lastModified: now, changeFrequency, priority,
      alternates: languageAlternates(baseUrl, path), ...(images ? { images } : {}),
    }));
  const pages: MetadataRoute.Sitemap = [...both("", 1, "monthly")];
  try {
    const property = await getProperty(site.slug);
    const units = await getShowcaseUnits(property.id);
    for (const unit of units) {
      pages.push(...both(`/alojamientos/${unit.id}`, 0.8, "weekly", unit.cover ? [unit.cover] : undefined));
    }
  } catch (error) {
    console.error(`sitemap: loading units of ${site.slug} failed:`, error);
  }
  return pages;
}
