import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale, locales } from "@/dictionaries";
import { SITE_URL, WHATSAPP_NUMBER, EMAIL, MAPS_URL } from "@/config/site";

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
  const title = "Saywa Lodges · Valle Sagrado, Cusco, Perú";
  const description = isEs
    ? "Lodge vacacional privado en Urubamba, Valle Sagrado de los Incas. Piscina privada, vistas a montañas andinas y acceso a Machu Picchu desde $180/noche."
    : "Private vacation lodge in Urubamba, Sacred Valley of the Incas. Private pool, Andean mountain views and access to Machu Picchu from $180/night.";

  return {
    title: { default: title, template: `%s | Saywa Lodges` },
    description,
    keywords: isEs
      ? [
          "lodge valle sagrado",
          "alquiler vacacional cusco",
          "urubamba hospedaje",
          "piscina privada peru",
          "cerca machu picchu",
          "saywa lodges",
        ]
      : [
          "sacred valley lodge",
          "vacation rental cusco",
          "urubamba accommodation",
          "private pool peru",
          "near machu picchu",
          "saywa lodges",
        ],
    openGraph: {
      type: "website",
      locale: isEs ? "es_PE" : "en_US",
      alternateLocale: isEs ? "en_US" : "es_PE",
      url: `${SITE_URL}/${lang}`,
      siteName: "Saywa Lodges",
      title,
      description,
      images: [
        {
          url: "/images/foto3.jpeg",
          width: 1200,
          height: 800,
          alt: "Saywa Lodges — private pool and Andean landscape, Valle Sagrado",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/images/foto3.jpeg"],
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    name: "Saywa Lodges",
    description: isEs
      ? "Lodge vacacional privado en Urubamba, Valle Sagrado de los Incas, Cusco, Perú."
      : "Private vacation lodge in Urubamba, Sacred Valley of the Incas, Cusco, Peru.",
    url: `${SITE_URL}/${lang}`,
    telephone: `+${WHATSAPP_NUMBER}`,
    email: EMAIL,
    address: {
      "@type": "PostalAddress",
      addressLocality: "Urubamba",
      addressRegion: "Cusco",
      addressCountry: "PE",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: -13.3162,
      longitude: -72.1263,
    },
    hasMap: MAPS_URL,
    priceRange: "$$",
    image: `${SITE_URL}/images/foto3.jpeg`,
    amenityFeature: [
      {
        "@type": "LocationFeatureSpecification",
        name: "Private Pool",
        value: true,
      },
      {
        "@type": "LocationFeatureSpecification",
        name: "Full Kitchen",
        value: true,
      },
      {
        "@type": "LocationFeatureSpecification",
        name: "Mountain Views",
        value: true,
      },
      {
        "@type": "LocationFeatureSpecification",
        name: "Free WiFi",
        value: true,
      },
    ],
    numberOfRooms: 3,
    petsAllowed: false,
    starRating: { "@type": "Rating", ratingValue: "4" },
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
