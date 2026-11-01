import type { Metadata } from "next";
import { marketingContent } from "@/config/marketing-content";
import { marketingDictionaries, type MarketingLocale } from "@/dictionaries/marketing";
import { env } from "@/lib/env";
import { marketingUrls } from "@/lib/domain/marketing";

export function marketingMetadata(locale: MarketingLocale): Metadata {
  const { seo } = marketingDictionaries[locale];
  const urls = marketingUrls(env.ROOT_DOMAIN, marketingContent.demoSubdomain, locale);
  const images = [{ url: `${urls.base}/images/saywa-direct-og.png`, width: 1200, height: 630, alt: "Saywa Direct" }];
  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical: urls.canonical, languages: { ...urls.languages, "x-default": urls.languages.es } },
    openGraph: {
      type: "website", siteName: "Saywa Direct", title: seo.title, description: seo.description,
      url: urls.canonical, locale: locale === "es" ? "es_PE" : "en_US",
      alternateLocale: locale === "es" ? "en_US" : "es_PE", images,
    },
    twitter: { card: "summary_large_image", title: seo.title, description: seo.description, images },
  };
}
