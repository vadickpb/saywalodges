import { getPublicHeroVideo } from "@/lib/dal/hero-media";
import { guestGuideCopy } from "@/dictionaries/guest-guide";
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
import { getShowcaseUnits } from "@/lib/dal/public/showcase-units";
import { getPublicUnitAvailability } from "@/lib/dal/public/availability";
import { getSpecialDates } from "@/lib/dal/public/special-dates";
import { todayInLima } from "@/lib/domain/dates";
import { buildMonthGrid, resolveCalendarMonth, resolveUnitId } from "@/lib/domain/public-availability";
import { formatPublicPrice, formatSeasonRange } from "@/lib/domain/public-rates";
import { format } from "@/lib/domain/format";
import { pick } from "@/lib/domain/site-content";
import { SiteHeader } from "@/components/site/site-header";
import { Hero } from "@/components/site/hero";
import { HeroSearch } from "@/components/site/hero-search";
import { Container } from "@/components/site/ui";
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
import { UnitsShowcase } from "@/components/site/units-showcase";
import { SpecialDates } from "@/components/site/special-dates";
import { publicSpecialDateName } from "@/lib/domain/special-dates";

export default async function SitePage({
  params,
  searchParams,
}: {
  params: Promise<{ host: string; lang: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { host, lang } = await params;
  if (!hasLocale(lang)) notFound();
  const publicLang = lang === "es" ? "es" : "en";

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
    const showcaseUnits = await getShowcaseUnits(property.id).catch((error: unknown) => {
      console.error(`SitePage: loading unit showcase of ${site.slug} failed:`, error);
      return [];
    });
    // Like units, rates are optional: a failure hides the price cards, not the site.
    const rates = await getPublicRates(property.id, property.currency).catch((error: unknown) => {
      console.error(`SitePage: loading rates of ${site.slug} failed:`, error);
      return null;
    });
    const specialDates = await getSpecialDates(property.id, todayInLima()).catch((error: unknown) => {
      console.error(`SitePage: loading special dates of ${site.slug} failed:`, error);
      return [];
    });
    data = { property, photos, spaces, amenities, distances, units, showcaseUnits, rates, specialDates };
  } catch (error) {
    // Same reasoning as app/sites/[host]/[lang]/layout.tsx's resolveSite:
    // a real DB failure would otherwise 404 silently, indistinguishable
    // from an unpublished/unknown property.
    console.error(`SitePage: loading ${site.slug} failed:`, error);
    notFound();
  }

  const { property, photos, spaces, amenities, distances, units, showcaseUnits, rates, specialDates } = data;
  const { content } = property;
  const videoUrl = await getPublicHeroVideo(property.orgId, lang);
  const mediaCopy = guestGuideCopy(lang);
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
  const hasUnitShowcase = showcaseUnits.length >= 2;
  const visibleSpaces = hasUnitShowcase ? spaces.filter((space) => space.unitId === null) : spaces;

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
    hasUnitShowcase && { href: "#accommodations", label: dict.unitsShowcase.label },
    visibleSpaces.length > 0 && { href: "#spaces", label: hasUnitShowcase ? dict.unitsShowcase.commonAreasTitle : dict.nav.spaces },
    rateCards.length > 0 && { href: "#rates", label: dict.nav.rates },
    specialDates.length > 0 && { href: "#special-dates", label: dict.nav.specialDates },
    unitId !== null && { href: "#availability-calendar", label: dict.nav.availability },
    { href: "#location", label: dict.nav.location },
    faq.length > 0 && { href: "#faq", label: dict.nav.faq },
    { href: "#contact", label: dict.nav.contact },
  ].filter((link) => link !== false);

  // SD-1134: the bar shows five main sections; the mobile menu and the footer keep the complete list.
  const primaryLinks = [
    { href: "#top", label: dict.nav.home },
    hasUnitShowcase && { href: "#accommodations", label: dict.nav.villas },
    visibleSpaces.length > 0 && { href: "#spaces", label: dict.nav.experiences },
    photos.gallery.length > 0 && { href: "#gallery", label: dict.nav.gallery },
    { href: "#location", label: dict.nav.location },
  ].filter((link) => link !== false);
  const maxGuests = Math.max(content.capacity ?? 0, ...units.map((unit) => unit.max_guests), 1);
  // The framed photo of the hero: the first gallery photo that is not the hero itself.
  const insetUrl = photos.gallery.find((photo) => photo !== photos.hero) ?? photos.gallery[0];

  return (
    <>
      <SiteHeader
        dict={dict.nav}
        lang={lang}
        name={property.name}
        logoUrl={property.logoUrl}
        links={[{ href: "#top", label: dict.nav.home }, ...links]}
        primaryLinks={primaryLinks}
        waUrl={waUrl}
        bookingHref="#reservar"
      />
      <main id="main" tabIndex={-1} className="outline-none">
        <Hero
          name={property.name}
          heroUrl={photos.hero}
          videoUrl={videoUrl}
          videoLabel={mediaCopy.video}
          videoFallback={mediaCopy.videoError}
          region={pick(content.region, lang)}
          headline={pick(content.headline, lang)}
          tagline={pick(content.tagline, lang)}
          locality={address}
          exploreHref={hasUnitShowcase ? "#accommodations" : "#gallery"}
          exploreLabel={hasUnitShowcase ? dict.hero.explore : dict.hero.exploreGallery}
          insetUrl={insetUrl}
        />
        <div className="relative z-10 -mt-14 sm:-mt-12">
          <Container><HeroSearch dict={dict.search} lang={lang} today={todayInLima()} maxGuests={maxGuests} /></Container>
        </div>
        <UnitsShowcase
          dict={dict.unitsShowcase}
          lang={lang}
          units={showcaseUnits}
          price={(cents) => formatPublicPrice(cents, property.currency, lang)}
          amenities={amenities.map((row) => resolveAmenity(row, lang))}
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
          intro={hasUnitShowcase ? "" : pick(content.spacesIntro, lang)}
          label={hasUnitShowcase ? dict.unitsShowcase.commonAreasLabel : undefined}
          title={hasUnitShowcase ? dict.unitsShowcase.commonAreasTitle : undefined}
          spaces={visibleSpaces.map((space) => ({
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
        <SpecialDates dates={specialDates} dict={dict.specialDates} lang={publicLang} />
        {unitId && (
          <Availability
            dict={dict.availability}
            waUrl={waUrl}
            waLabel={dict.rates.availabilityCta}
            quoteHref={`/${lang}/cotizar`}
            quoteLabel={dict.publicQuote.cta}
            units={units.map((unit) => ({ id: unit.id, name: unit.name }))}
            unitId={unitId}
            nav={monthNav}
            weeks={weeks}
            specialDates={specialDates.map((date) => ({
              startDate: date.startDate,
              endDate: date.endDate,
              name: publicSpecialDateName({ es: date.publicNameEs, en: date.publicNameEn }, publicLang),
            }))}
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
