import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/dictionaries";
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

export default async function Home({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  const dict = await getDictionary(lang);

  return (
    <>
      <Navbar dict={dict.nav} lang={lang} />
      <main>
        <Hero dict={dict.hero} lang={lang} />
        <Amenities dict={dict.amenities} />
        <Gallery dict={dict.gallery} lang={lang} />
        <SpacesSection dict={dict.spaces} lang={lang} />
        <Rates dict={dict.rates} lang={lang} />
        <Availability dict={dict.availability} lang={lang} />
        <Location dict={dict.location} />
        <ContactSection dict={dict.contact} lang={lang} />
      </main>
      <Footer dict={dict.footer} lang={lang} />
      <WhatsAppFloat />
    </>
  );
}
