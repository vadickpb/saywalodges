import Link from "next/link";
import { Bath, BedDouble, DoorOpen, Users } from "lucide-react";
import type { Dict, Locale } from "@/dictionaries";
import type { ShowcaseUnit } from "@/lib/dal/public/showcase-units";
import { showcaseFacts, showcaseSectionTitle, showcaseTypeLabel } from "@/lib/domain/units-showcase";
import { format } from "@/lib/domain/format";
import { Container, Photo, SectionHeading, buttonStyles } from "./ui";

type Props = {
  dict: Dict["unitsShowcase"];
  lang: Locale;
  units: ShowcaseUnit[];
  price: (cents: number) => string;
};

const FACT_ICONS = [Users, DoorOpen, BedDouble, Bath];

export function UnitsShowcase({ dict, lang, units, price }: Props) {
  if (units.length < 2) return null;
  const title = showcaseSectionTitle(units.map((unit) => unit.showcaseType), lang);
  return (
    <section id="accommodations" className="scroll-mt-20 bg-site-surface py-20 sm:py-28">
      <Container>
        <SectionHeading label={dict.label} title={title} />
        <ul className="mt-10 grid gap-6 lg:grid-cols-2">
          {units.map((unit) => {
            const facts = showcaseFacts({
              maxGuests: unit.maxGuests, bedrooms: unit.bedrooms, beds: unit.beds, bathrooms: unit.bathrooms,
              bedDetails: lang === "es" ? unit.bedDetailsEs : unit.bedDetailsEn,
            }, lang);
            return (
              <li key={unit.id} className="overflow-hidden rounded-site border border-site-line bg-site-bg shadow-sm">
                <div className="relative aspect-[4/3] sm:aspect-[16/10]">
                  <Photo src={unit.cover} alt="" sizes="(min-width: 1024px) 50vw, 100vw" placeholderLabel={lang === "es" ? "Fotos próximamente" : "Photos coming soon"} />
                </div>
                <div className="p-5 sm:p-7">
                  <p className="text-xs font-semibold uppercase tracking-wider text-site-accent">{showcaseTypeLabel(unit.showcaseType, lang)}</p>
                  <h3 className="mt-2 font-site-heading text-2xl tracking-tight">{unit.name}</h3>
                  <ul className="mt-4 grid gap-2 text-sm text-site-muted sm:grid-cols-2">
                    {facts.map((fact, index) => {
                      const Icon = FACT_ICONS[index];
                      return <li key={fact} className="flex items-start gap-2"><Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{fact}</span></li>;
                    })}
                  </ul>
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                    <p className="font-semibold">{unit.fromCents === null ? "" : format(dict.from, { price: price(unit.fromCents) })}</p>
                    <Link href={`/${lang}/alojamientos/${unit.id}`} className={buttonStyles.primary}>{format(dict.view, { name: unit.name })}</Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
