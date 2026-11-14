import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bath, BedDouble, DoorOpen, Users } from "lucide-react";
import { getDictionary, hasLocale } from "@/dictionaries";
import { getSiteByHost, getSiteUrl } from "@/lib/dal/public/site";
import { getProperty, whatsappUrl } from "@/lib/dal/public/property";
import { getSpaces } from "@/lib/dal/public/spaces";
import { getShowcaseUnit } from "@/lib/dal/public/showcase-units";
import { getPublicUnitAvailability } from "@/lib/dal/public/availability";
import { buildMonthGrid, resolveCalendarMonth } from "@/lib/domain/public-availability";
import { formatPublicPrice } from "@/lib/domain/public-rates";
import { showcaseFacts, showcaseTypeLabel } from "@/lib/domain/units-showcase";
import { pick } from "@/lib/domain/site-content";
import { format } from "@/lib/domain/format";
import { toJsonLd } from "@/lib/json-ld";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { Gallery } from "@/components/site/gallery";
import { Spaces } from "@/components/site/spaces";
import { Availability } from "@/components/site/availability";
import { Container, SectionHeading, buttonStyles } from "@/components/site/ui";

type Params = Promise<{ host: string; lang: string; unitId: string }>;

async function resolveUnit(host: string, unitId: string) {
  const site = await getSiteByHost(host);
  if (!site) return null;
  try {
    const property = await getProperty(site.slug);
    const unit = await getShowcaseUnit(property.id, unitId);
    return unit ? { property, unit } : null;
  } catch (error) {
    console.error(`UnitPage: loading ${site.slug}/${unitId} failed:`, error);
    return null;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { host, lang, unitId } = await params;
  if (!hasLocale(lang)) return {};
  const resolved = await resolveUnit(host, unitId);
  if (!resolved) return {};
  const { property, unit } = resolved;
  const realHost = (await headers()).get("host") ?? host;
  const siteUrl = getSiteUrl(realHost);
  const description = (lang === "es" ? unit.descriptionEs : unit.descriptionEn) || unit.name;
  const url = `${siteUrl}/${lang}/alojamientos/${unit.id}`;
  const otherLang = lang === "es" ? "en" : "es";
  return {
    title: unit.name,
    description,
    alternates: {
      canonical: url,
      languages: { [lang]: url, [otherLang]: `${siteUrl}/${otherLang}/alojamientos/${unit.id}` },
    },
    openGraph: {
      type: "website", url, siteName: property.name, title: unit.name, description,
      images: unit.cover ? [{ url: unit.cover, alt: unit.name }] : [],
    },
  };
}

export default async function UnitPage({ params, searchParams }: {
  params: Params;
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const { host, lang, unitId } = await params;
  if (!hasLocale(lang)) notFound();
  const resolved = await resolveUnit(host, unitId);
  if (!resolved) notFound();
  const { property, unit } = resolved;
  const dict = await getDictionary(lang);
  const allSpaces = await getSpaces(property.id);
  const commonSpaces = allSpaces.filter((space) => space.unitId === null);
  const gallery = unit.spaces.flatMap((space) => space.photos);
  const description = lang === "es" ? unit.descriptionEs : unit.descriptionEn;
  const bedDetails = lang === "es" ? unit.bedDetailsEs : unit.bedDetailsEn;
  const facts = showcaseFacts({
    maxGuests: unit.maxGuests, bedrooms: unit.bedrooms, beds: unit.beds, bathrooms: unit.bathrooms, bedDetails,
  }, lang);
  const monthValue = (await searchParams).month;
  const monthNav = resolveCalendarMonth(Array.isArray(monthValue) ? monthValue[0] : monthValue);
  let weeks = null;
  try {
    const ranges = await getPublicUnitAvailability(property.id, unit.id, monthNav.month);
    weeks = ranges ? buildMonthGrid(monthNav.month, ranges) : null;
  } catch (error) {
    console.error(`UnitPage: availability of ${unit.id} failed:`, error);
  }
  const price = unit.fromCents === null ? "" : format(dict.unitsShowcase.from, {
    price: formatPublicPrice(unit.fromCents, property.currency, lang),
  });
  const waUrl = whatsappUrl(property, lang);
  const otherLang = lang === "es" ? "en" : "es";
  const links = [
    gallery.length > 0 && { href: "#gallery", label: dict.nav.gallery },
    unit.spaces.length > 0 && { href: "#unit-spaces", label: dict.unitsShowcase.unitSpacesTitle },
    commonSpaces.length > 0 && { href: "#common-areas", label: dict.unitsShowcase.commonAreasUsedTitle },
    { href: "#availability-calendar", label: dict.nav.availability },
  ].filter((link) => link !== false);
  const quoteHref = `/${lang}/cotizar?unit=${encodeURIComponent(unit.id)}`;
  const realHost = (await headers()).get("host") ?? host;
  const unitUrl = `${getSiteUrl(realHost)}/${lang}/alojamientos/${unit.id}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Accommodation",
    name: unit.name,
    description,
    url: unitUrl,
    image: gallery,
    occupancy: { "@type": "QuantitativeValue", maxValue: unit.maxGuests },
    numberOfBedrooms: unit.bedrooms,
    numberOfBathroomsTotal: unit.bathrooms,
    containedInPlace: { "@type": "LodgingBusiness", name: property.name, url: `${getSiteUrl(realHost)}/${lang}` },
  };
  const localizedSpace = (space: typeof unit.spaces[number]) => ({
    id: space.id, icon: space.icon, name: lang === "es" ? space.labelEs : space.labelEn,
    description: lang === "es" ? space.descriptionEs : space.descriptionEn, capacity: space.capacity ?? undefined,
    badge: (lang === "es" ? space.badgeEs : space.badgeEn) ?? undefined, photos: space.photos,
  });

  return (
    <>
      <SiteHeader
        dict={dict.nav} lang={lang} name={property.name} logoUrl={property.logoUrl} links={links} overImage={false}
        languageHref={`/${otherLang}/alojamientos/${unit.id}`} bookingHref={quoteHref}
      />
      <main id="main" tabIndex={-1} className="outline-none">
        <section id="top" className="pt-28 sm:pt-36">
          <Container>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-site-accent">{showcaseTypeLabel(unit.showcaseType, lang)}</p>
            <h1 className="mt-3 max-w-4xl font-site-heading text-4xl tracking-tight sm:text-6xl">{unit.name}</h1>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm text-site-muted">
              {[Users, DoorOpen, BedDouble, Bath].map((Icon, index) => <li key={facts[index]} className="flex items-center gap-2"><Icon className="size-4" aria-hidden="true" />{facts[index]}</li>)}
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              {price && <p className="font-semibold">{price}</p>}
              <Link href={quoteHref} className={buttonStyles.primary}>{format(dict.unitsShowcase.quote, { name: unit.name })}</Link>
            </div>
          </Container>
        </section>
        <Gallery dict={dict.gallery} name={unit.name} photos={gallery} />
        {description && <section className="py-20 sm:py-28"><Container><SectionHeading label={dict.unitsShowcase.descriptionLabel} title={unit.name} /><p className="mt-6 max-w-3xl whitespace-pre-line text-base leading-relaxed text-site-muted sm:text-lg">{description}</p></Container></section>}
        <Spaces
          dict={dict.spaces} lightboxLabels={dict.gallery} intro="" sectionId="unit-spaces"
          label={dict.unitsShowcase.unitSpacesLabel} title={dict.unitsShowcase.unitSpacesTitle} spaces={unit.spaces.map(localizedSpace)}
        />
        <Spaces
          dict={dict.spaces} lightboxLabels={dict.gallery} intro="" sectionId="common-areas"
          label={dict.unitsShowcase.commonAreasLabel} title={dict.unitsShowcase.commonAreasUsedTitle}
          spaces={commonSpaces.map((space) => ({
            id: space.id, icon: space.icon, name: pick(space.label, lang), description: pick(space.desc, lang),
            capacity: space.capacity, badge: space.badge ? pick(space.badge, lang) : undefined, photos: space.photos,
          }))}
        />
        <Availability
          dict={{ ...dict.availability, intro: dict.unitsShowcase.availabilityIntro }} waUrl={waUrl} waLabel={dict.rates.availabilityCta}
          quoteHref={quoteHref} quoteLabel={dict.publicQuote.cta} units={[{ id: unit.id, name: unit.name }]}
          unitId={unit.id} nav={monthNav} weeks={weeks}
        />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(jsonLd) }} />
      </main>
      <SiteFooter
        dict={dict.footer} name={property.name} region={pick(property.content.region, lang)} links={links}
        email={property.email} whatsappNumber={property.whatsappNumber} waUrl={waUrl}
      />
    </>
  );
}
