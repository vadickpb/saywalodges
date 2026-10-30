import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/dictionaries";
import { getSiteByHost } from "@/lib/dal/public/site";
import {
  getAmenities,
  getDistances,
  getProperty,
  resolveAmenity,
  resolveDistance,
  whatsappUrl,
} from "@/lib/dal/public/property";
import { getPublicRates } from "@/lib/dal/public/rates";
import { getPhotosConfig } from "@/lib/dal/public/photos";
import { getSpaces } from "@/lib/dal/public/spaces";
import { getActiveUnits } from "@/lib/dal/public/units";
import { getPublicUnitAvailability } from "@/lib/dal/public/availability";
import { buildMonthGrid, resolveCalendarMonth, resolveUnitId } from "@/lib/domain/public-availability";
import { formatPublicPrice, formatSeasonRange } from "@/lib/domain/public-rates";
import { format } from "@/lib/domain/format";
import { pick } from "@/lib/domain/site-content";
import { SiteHeader } from "@/components/site/site-header";
import { Hero } from "@/components/site/hero";
import { Intro } from "@/components/site/intro";
import { Gallery } from "@/components/site/gallery";
import { Spaces } from "@/components/site/spaces";
import { Rates } from "@/components/site/rates";
import { Availability } from "@/components/site/availability";
import { Location } from "@/components/site/location";
import { Faq } from "@/components/site/faq";
import { Contact } from "@/components/site/contact";
import { SiteFooter } from "@/components/site/site-footer";
import { MobileCta } from "@/components/site/mobile-cta";

export default async function SitePage({
  params,
  searchParams,
}: {
  params: Promise<{ host: string; lang: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { host, lang } = await params;
  if (!hasLocale(lang)) notFound();

  const site = await getSiteByHost(host);
  if (!site) notFound();

  let data;
  try {
    const property = await getProperty(site.slug);
    const [photos, spaces, amenities, distances] = await Promise.all([
      getPhotosConfig(property.id),
      getSpaces(property.id),
      getAmenities(property.id),
      getDistances(property.id),
    ]);
    // Units are optional for the page: a failure hides the calendar, not the site.
    const units = await getActiveUnits(property.id).catch((error: unknown) => {
      console.error(`SitePage: loading units of ${site.slug} failed:`, error);
      return [];
    });
    // Like units, rates are optional: a failure hides the price cards, not the site.
    const rates = await getPublicRates(property.id, property.currency).catch((error: unknown) => {
      console.error(`SitePage: loading rates of ${site.slug} failed:`, error);
      return null;
    });
    data = { property, photos, spaces, amenities, distances, units, rates };
  } catch (error) {
    // Same reasoning as app/sites/[host]/[lang]/layout.tsx's resolveSite:
    // a real DB failure would otherwise 404 silently, indistinguishable
    // from an unpublished/unknown property.
    console.error(`SitePage: loading ${site.slug} failed:`, error);
    notFound();
  }

  const { property, photos, spaces, amenities, distances, units, rates } = data;
  const { content } = property;
  const dict = await getDictionary(lang);
  const waUrl = whatsappUrl(property, lang);
  const fromLabel = (cents: number) =>
    format(dict.rates.from, { price: formatPublicPrice(cents, property.currency, lang) });
  const rateCards = (rates?.cards ?? []).map((card) => ({
    key: card.key,
    title: card.season ? card.season.name : dict.rates.base,
    period: card.season ? formatSeasonRange(card.season.startDate, card.season.endDate, lang) : "",
    from: fromLabel(card.fromCents),
  }));
  const faq = (content.faq ?? []).map((item) => ({
    question: pick(item.question, lang),
    answer: pick(item.answer, lang),
  }));
  const address = [property.addressLocality, property.addressRegion].filter(Boolean).join(", ");

  // Public availability: month and unit come from the URL, so both are untrusted. The
  // unit must be one of this property's own active units; the month is clamped to the
  // navigable range. Only dates already reduced to free/occupied reach the component.
  const query = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const unitId = resolveUnitId(first(query.unit), units.map((unit) => unit.id));
  const monthNav = resolveCalendarMonth(first(query.month));
  let weeks = null;
  if (unitId) {
    try {
      const ranges = await getPublicUnitAvailability(property.id, unitId, monthNav.month);
      weeks = ranges ? buildMonthGrid(monthNav.month, ranges) : null;
    } catch (error) {
      console.error(`SitePage: availability of ${site.slug} failed:`, error);
    }
  }

  // Only link to sections that will actually render for this tenant.
  const links = [
    photos.gallery.length > 0 && { href: "#gallery", label: dict.nav.gallery },
    spaces.length > 0 && { href: "#spaces", label: dict.nav.spaces },
    rateCards.length > 0 && { href: "#rates", label: dict.nav.rates },
    unitId !== null && { href: "#availability-calendar", label: dict.nav.availability },
    { href: "#location", label: dict.nav.location },
    faq.length > 0 && { href: "#faq", label: dict.nav.faq },
    { href: "#contact", label: dict.nav.contact },
  ].filter((link) => link !== false);

  return (
    <>
      <SiteHeader
        dict={dict.nav}
        lang={lang}
        name={property.name}
        logoUrl={property.logoUrl}
        links={links}
        overImage={Boolean(photos.hero)}
      />
      <main id="main" tabIndex={-1} className="outline-none">
        <Hero
          dict={dict.hero}
          name={property.name}
          heroUrl={photos.hero}
          region={pick(content.region, lang)}
          headline={pick(content.headline, lang)}
          tagline={pick(content.tagline, lang)}
          capacity={content.capacity}
          bedrooms={spaces.filter((s) => s.category === "rooms").length}
          locality={address}
          waUrl={waUrl}
        />
        <Intro
          dict={dict.intro}
          title={property.name}
          intro={pick(content.intro, lang)}
          highlights={(content.highlights ?? []).map((h) => pick(h, lang))}
          amenities={amenities.map((row) => resolveAmenity(row, lang))}
        />
        <Gallery dict={dict.gallery} name={property.name} photos={photos.gallery} />
        <Spaces
          dict={dict.spaces}
          lightboxLabels={dict.gallery}
          intro={pick(content.spacesIntro, lang)}
          spaces={spaces.map((space) => ({
            id: space.id,
            icon: space.icon,
            name: pick(space.label, lang),
            description: pick(space.desc, lang),
            capacity: space.capacity,
            badge: space.badge ? pick(space.badge, lang) : undefined,
            photos: space.photos,
          }))}
        />
        <Rates dict={dict.rates} cards={rateCards} waUrl={waUrl} />
        {unitId && (
          <Availability
            dict={dict.availability}
            waUrl={waUrl}
            waLabel={dict.rates.availabilityCta}
            units={units.map((unit) => ({ id: unit.id, name: unit.name }))}
            unitId={unitId}
            nav={monthNav}
            weeks={weeks}
          />
        )}
        <Location
          dict={dict.location}
          blurb={pick(content.locationBlurb, lang)}
          address={address}
          mapsUrl={property.mapsUrl}
          distances={distances.map((row) => resolveDistance(row, lang))}
        />
        <Faq dict={dict.faq} items={faq} />
        <Contact dict={dict.contact} waUrl={waUrl} email={property.email} />
      </main>
      <SiteFooter
        dict={dict.footer}
        name={property.name}
        region={pick(content.region, lang)}
        links={links}
        email={property.email}
        whatsappNumber={property.whatsappNumber}
        waUrl={waUrl}
      />
      <MobileCta label={dict.hero.whatsapp} detail={rates?.fromCents != null ? fromLabel(rates.fromCents) : ""} waUrl={waUrl} />
    </>
  );
}
