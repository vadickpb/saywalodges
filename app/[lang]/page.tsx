import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/dictionaries";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Amenities from "@/components/Amenities";
import Gallery from "@/components/Gallery";
import Rates from "@/components/Rates";
import Location from "@/components/Location";
import Footer from "@/components/Footer";

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
        <Hero dict={dict.hero} />
        <Amenities dict={dict.amenities} />
        <Gallery dict={dict.gallery} />
        <Rates dict={dict.rates} />
        <Location dict={dict.location} />
      </main>
      <Footer dict={dict.footer} lang={lang} />
    </>
  );
}
