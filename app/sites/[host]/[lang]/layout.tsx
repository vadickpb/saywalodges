import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { hasLocale } from "@/dictionaries";
import { getSiteByHost, getSiteUrl } from "@/lib/dal/public/site";
import { getProperty, getAmenities, resolveAmenity } from "@/lib/dal/public/property";
import { getSpaces } from "@/lib/dal/public/spaces";
import { getPhotosConfig } from "@/lib/dal/public/photos";
import { toJsonLd } from "@/lib/json-ld";
import { themeToCssVars } from "@/lib/domain/site-theme";
import { fontVariables } from "./fonts";
import "@/app/globals.css";

// This is its own root layout (no app/layout.tsx above it — see Next.js's
// "multiple root layouts" pattern) specifically so <html lang> can come
// directly from the [lang] route param instead of a headers()-injected
// value, per ADR-0001.
export async function generateViewport({
  params,
}: {
  params: Promise<{ host: string; lang: string }>;
}): Promise<Viewport> {
  const { host } = await params;
  const property = await resolveSite(host);
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: property?.theme.primary,
  };
}

// Resolves [host] to a property, 404ing for an unknown host or an
// unpublished one — RLS already hides unpublished properties from the
// anon client, so getProperty() throws for both cases identically.
async function resolveSite(host: string) {
  const site = await getSiteByHost(host);
  if (!site) return null;
  try {
    return await getProperty(site.slug);
  } catch (error) {
    // Catches both "doesn't exist" and "not published" (RLS makes them
    // identical from here), but also any real failure — a DB outage would
    // otherwise look exactly like an unknown host, with nothing in the
    // logs to tell them apart.
    console.error(`resolveSite: getProperty(${site.slug}) failed:`, error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ host: string; lang: string }>;
}): Promise<Metadata> {
  const { host, lang } = await params;
  if (!hasLocale(lang)) return {};

  const property = await resolveSite(host);
  if (!property) return {};

  // [host] is the stripped siteIdentifier (e.g. "saywa-lodges", not
  // "saywa-lodges.localhost:3000") — only right for the DB lookup above.
  // Metadata URLs need the real external host, from the request itself.
  const realHost = (await headers()).get("host") ?? host;
  const siteUrl = getSiteUrl(realHost);
  const isEs = lang === "es";
  const { hero } = await getPhotosConfig(property.id);
  const title = isEs ? property.metaTitleEs : property.metaTitleEn;
  const description = isEs ? property.metaDescriptionEs : property.metaDescriptionEn;
  const keywords = isEs ? property.metaKeywordsEs : property.metaKeywordsEn;

  return {
    metadataBase: new URL(siteUrl),
    title: { default: title, template: `%s | ${property.name}` },
    description,
    keywords,
    openGraph: {
      type: "website",
      locale: isEs ? "es_PE" : "en_US",
      alternateLocale: isEs ? "en_US" : "es_PE",
      url: `${siteUrl}/${lang}`,
      siteName: property.name,
      title,
      description,
      images: [
        {
          url: hero,
          width: 1200,
          height: 800,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [hero],
    },
    alternates: {
      canonical: `${siteUrl}/${lang}`,
      languages: {
        en: `${siteUrl}/en`,
        es: `${siteUrl}/es`,
      },
    },
  };
}

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ host: string; lang: string }>;
}) {
  const { host, lang } = await params;
  if (!hasLocale(lang)) notFound();

  const property = await resolveSite(host);
  if (!property) notFound();

  // Same reasoning as generateMetadata above: [host] is just the DB lookup
  // key, not a usable URL host.
  const realHost = (await headers()).get("host") ?? host;
  const siteUrl = getSiteUrl(realHost);
  const isEs = lang === "es";
  const { hero } = await getPhotosConfig(property.id);
  const [spaces, amenityRows] = await Promise.all([
    getSpaces(property.id),
    getAmenities(property.id),
  ]);
  const numberOfRooms = spaces.filter((s) => s.category === "rooms").length;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    name: property.name,
    description: isEs ? property.metaDescriptionEs : property.metaDescriptionEn,
    url: `${siteUrl}/${lang}`,
    telephone: `+${property.whatsappNumber}`,
    email: property.email,
    address: {
      "@type": "PostalAddress",
      addressLocality: property.addressLocality,
      addressRegion: property.addressRegion,
      addressCountry: property.addressCountry,
    },
    ...(property.latitude != null && property.longitude != null
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: property.latitude,
            longitude: property.longitude,
          },
        }
      : {}),
    hasMap: property.mapsUrl,
    priceRange: property.priceRange,
    image: hero,
    amenityFeature: amenityRows.map((row) => ({
      "@type": "LocationFeatureSpecification",
      name: resolveAmenity(row, lang).title,
      value: true,
    })),
    numberOfRooms,
    petsAllowed: property.petsAllowed,
    ...(property.starRating != null
      ? { starRating: { "@type": "Rating", ratingValue: String(property.starRating) } }
      : {}),
  };

  return (
    <html lang={lang} className={`${fontVariables} h-full antialiased`}>
      {/* Tenant theme as CSS variables: themeToCssVars only ever emits
          validated hex colors or fixed strings, never raw DB text. */}
      <body className="site min-h-full" style={themeToCssVars(property.theme)}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: toJsonLd(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
