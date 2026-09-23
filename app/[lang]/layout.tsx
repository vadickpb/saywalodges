import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, locales } from "@/dictionaries";
import { SITE_URL } from "@/config/site";
import { getProperty, getAmenities, resolveAmenity } from "@/lib/property";
import { getSpaces } from "@/lib/spaces";
import { getPhotosConfig } from "@/lib/photos";

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};

  const isEs = lang === "es";
  const property = await getProperty();
  const { hero } = await getPhotosConfig(property.id);
  const title = isEs ? property.metaTitleEs : property.metaTitleEn;
  const description = isEs ? property.metaDescriptionEs : property.metaDescriptionEn;
  const keywords = isEs ? property.metaKeywordsEs : property.metaKeywordsEn;

  return {
    title: { default: title, template: `%s | ${property.name}` },
    description,
    keywords,
    openGraph: {
      type: "website",
      locale: isEs ? "es_PE" : "en_US",
      alternateLocale: isEs ? "en_US" : "es_PE",
      url: `${SITE_URL}/${lang}`,
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
      canonical: `${SITE_URL}/${lang}`,
      languages: {
        en: `${SITE_URL}/en`,
        es: `${SITE_URL}/es`,
      },
    },
  };
}

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  const isEs = lang === "es";
  const property = await getProperty();
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
    url: `${SITE_URL}/${lang}`,
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
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
