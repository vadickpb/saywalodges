import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale, locales } from "@/dictionaries";
import type { LayoutProps } from "next/dist/shared/lib/app-router-context.shared-runtime";

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
  const dict = await getDictionary(lang);
  return {
    title: "Saywa Lodges · Valle Sagrado, Cusco, Perú",
    description:
      lang === "en"
        ? "Private vacation lodge in Urubamba, Sacred Valley of the Incas. Private pool, Andean mountain views and access to Machu Picchu."
        : "Lodge vacacional privado en Urubamba, Valle Sagrado de los Incas. Piscina privada, vistas a montañas andinas y acceso a Machu Picchu.",
    alternates: {
      languages: {
        en: "/en",
        es: "/es",
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
  return <>{children}</>;
}
