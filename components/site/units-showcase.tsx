import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import type { Dict, Locale } from "@/dictionaries";
import type { ShowcaseUnit } from "@/lib/dal/public/showcase-units";
import { format } from "@/lib/domain/format";
import { MountainDivider } from "./mountain-divider";
import { SiteIcon } from "./icon";
import { Container, Photo, buttonStyles } from "./ui";

type Amenity = { icon: string; title: string };

type Props = {
  dict: Dict["unitsShowcase"];
  lang: Locale;
  units: ShowcaseUnit[];
  price: (cents: number) => string;
  /** The first few amenities the owner configured, as a strip of icons under the cards. */
  amenities?: Amenity[];
};

// SD-1134: "Elige tu manera de hospedarte". Each separate unit is a photo card; a unit made of the others (the whole complex) is a
// quiet card beside them. Facts and prices come from the owner's data.
export function UnitsShowcase({ dict, lang, units, price, amenities = [] }: Props) {
  if (units.length < 2) return null;
  const parts = units.filter((unit) => unit.partIds.length === 0);
  const wholes = units.filter((unit) => unit.partIds.length > 0);
  const factsOf = (unit: ShowcaseUnit) => [
    format(dict.upTo, { count: unit.maxGuests }),
    unit.bedrooms > 0 ? (unit.bedrooms === 1 ? dict.bedroomOne : format(dict.bedroomMany, { count: unit.bedrooms })) : null,
  ].filter(Boolean).join(" · ");

  return (
    <section id="accommodations" className="scroll-mt-24 bg-site-bg pb-16 pt-20 sm:pb-20 sm:pt-24">
      <Container>
        <div className="mx-auto max-w-2xl text-center text-site-accent">
          <MountainDivider className="justify-center" />
          <h2 className="mt-4 font-site-heading text-3xl font-semibold tracking-tight text-site-primary sm:text-4xl lg:text-5xl">{dict.chooseTitle}</h2>
          <p className="mt-3 text-base leading-relaxed text-site-muted sm:text-lg">{dict.chooseIntro}</p>
        </div>

        {/* Two separate units and one whole complex is the layout of the design; any other mix flows in an even grid. */}
        <ul className={`mt-10 grid gap-5 sm:grid-cols-2 ${parts.length === 2 && wholes.length === 1 ? "lg:grid-cols-[1fr_1fr_0.75fr]" : parts.length + wholes.length >= 3 ? "lg:grid-cols-3" : ""}`}>
          {parts.map((unit) => (
            <li key={unit.id} className="group relative isolate flex min-h-[320px] overflow-hidden rounded-site shadow-md sm:min-h-[380px]">
              <Photo src={unit.cover} alt="" sizes="(min-width: 1024px) 38vw, 100vw" className="-z-20 transition duration-500 group-hover:scale-105" placeholderLabel={lang === "es" ? "Fotos próximamente" : "Photos coming soon"} />
              <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-t from-black/75 via-black/20 to-transparent" />
              <div className="mt-auto w-full p-6 text-white">
                <h3 className="font-site-heading text-3xl font-semibold tracking-tight">{unit.name}</h3>
                <p className="mt-1 text-[15px] opacity-95">{factsOf(unit)}</p>
                {unit.fromCents !== null && <p className="mt-1 text-sm opacity-90">{format(dict.from, { price: price(unit.fromCents) })}</p>}
                <Link href={`/${lang}/alojamientos/${unit.id}`} className={`${buttonStyles.glass} mt-4 px-5! py-2.5!`}>
                  {dict.details}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            </li>
          ))}
          {wholes.map((unit) => (
            <li key={unit.id} className="flex flex-col items-center justify-center rounded-site border border-site-line bg-site-surface p-8 text-center">
              <Users className="size-9 text-site-primary" strokeWidth={1.25} aria-hidden="true" />
              <h3 className="mt-4 font-site-heading text-2xl font-semibold tracking-tight">{unit.name}</h3>
              <p className="mt-2 text-site-muted">{format(dict.upTo, { count: unit.maxGuests })}</p>
              {unit.fromCents !== null && <p className="mt-1 text-sm text-site-muted">{format(dict.from, { price: price(unit.fromCents) })}</p>}
              <Link href={`/${lang}/alojamientos/${unit.id}`} className={`${buttonStyles.primary} mt-6 px-6!`}>
                {dict.discover}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>

        {amenities.length > 0 && (
          <ul className="mt-12 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-site-line pt-8 sm:grid-cols-3 lg:grid-cols-5 lg:divide-x lg:divide-site-line">
            {amenities.slice(0, 5).map((amenity) => (
              <li key={amenity.title} className="flex items-center gap-3 lg:justify-center lg:px-4">
                <SiteIcon emoji={amenity.icon} className="size-8 shrink-0 text-site-primary" />
                <span className="text-[15px] leading-snug">{amenity.title}</span>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>
  );
}
