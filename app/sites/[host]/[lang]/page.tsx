import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/dictionaries";
import { getSiteByHost } from "@/lib/dal/public/site";
import { getProperty, whatsappUrl } from "@/lib/dal/public/property";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Amenities from "@/components/Amenities";
import Gallery from "@/components/Gallery";
import SpacesSection from "@/components/SpacesSection";
import Rates from "@/components/Rates";
import Location from "@/components/Location";
import Availability from "@/components/Availability";
import ContactSection from "@/components/ContactSection";
import Footer from "@/components/Footer";
import WhatsAppFloat from "@/components/WhatsAppFloat";

export default async function SitePage({
  params,
}: {
  params: Promise<{ host: string; lang: string }>;
}) {
  const { host, lang } = await params;
  if (!hasLocale(lang)) notFound();

  const site = await getSiteByHost(host);
  if (!site) notFound();

  let property;
  try {
    property = await getProperty(site.slug);
  } catch (error) {
    // Same reasoning as app/sites/[host]/[lang]/layout.tsx's resolveSite:
    // a real DB failure would otherwise 404 silently, indistinguishable
    // from an unpublished/unknown property.
    console.error(`SitePage: getProperty(${site.slug}) failed:`, error);
    notFound();
  }

  const dict = await getDictionary(lang);
  const waUrl = whatsappUrl(property, lang);

  return (
    <>
      <Navbar dict={dict.nav} lang={lang} name={property.name} logoUrl={property.logoUrl} />
      <main>
        <Hero dict={dict.hero} lang={lang} propertyId={property.id} waUrl={waUrl} name={property.name} />
        <Amenities dict={dict.amenities} lang={lang} propertyId={property.id} />
        <Gallery dict={dict.gallery} lang={lang} propertyId={property.id} waUrl={waUrl} name={property.name} />
        <SpacesSection dict={dict.spaces} lang={lang} propertyId={property.id} name={property.name} />
        <Rates dict={dict.rates} lang={lang} propertyId={property.id} waUrl={waUrl} />
        <Availability
          dict={dict.availability}
          lang={lang}
          waUrl={waUrl}
          airbnbUrl={property.airbnbUrl}
        />
        <Location
          dict={dict.location}
          lang={lang}
          propertyId={property.id}
          mapsUrl={property.mapsUrl}
          name={property.name}
          addressLocality={property.addressLocality}
          addressRegion={property.addressRegion}
        />
        <ContactSection dict={dict.contact} lang={lang} waUrl={waUrl} email={property.email} name={property.name} />
      </main>
      <Footer dict={dict.footer} lang={lang} waUrl={waUrl} email={property.email} airbnbUrl={property.airbnbUrl} name={property.name} />
      <WhatsAppFloat waUrl={whatsappUrl(property, "en")} />
    </>
  );
}
