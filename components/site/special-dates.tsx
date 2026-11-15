import Link from "next/link";
import type { Dict } from "@/dictionaries/en";
import type { PublicSpecialDate } from "@/lib/dal/public/special-dates";
import { format } from "@/lib/domain/format";
import { formatPublicPrice } from "@/lib/domain/public-rates";
import { formatSpecialDateRange, publicSpecialDateName, type PublicLanguage } from "@/lib/domain/special-dates";
import { Container, SectionHeading, buttonStyles } from "./ui";

export function SpecialDates({ dates, dict, lang }: { dates: PublicSpecialDate[]; dict: Dict["specialDates"]; lang: PublicLanguage }) {
  if (dates.length === 0) return null;
  return (
    <section id="special-dates" className="scroll-mt-20 border-y border-site-line bg-site-surface py-20 sm:py-28">
      <Container>
        <SectionHeading label={dict.label} title={dict.title} />
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-site-muted">{dict.intro}</p>
        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          {dates.map((date) => (
            <article key={date.id} className="rounded-site border border-site-line bg-site-bg p-5 sm:p-7">
              <p className="text-sm font-semibold uppercase tracking-wide text-site-accent">
                {formatSpecialDateRange(date.startDate, date.endDate, lang)}
              </p>
              <h3 className="mt-2 font-site-heading text-2xl tracking-tight">
                {publicSpecialDateName({ es: date.publicNameEs, en: date.publicNameEn }, lang)}
              </h3>
              <p className="mt-2 text-sm text-site-muted">{date.nights === 1 ? dict.oneNight : format(dict.nights, { count: date.nights })}</p>
              <ul className="mt-6 divide-y divide-site-line">
                {date.units.map((unit) => {
                  const canQuote = unit.status === "available";
                  return (
                    <li key={unit.id} className="py-5 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h4 className="font-semibold">{unit.name}</h4>
                          {unit.minNights !== null && (
                            <p className="mt-1 text-xs text-site-muted">
                              {unit.minNights === 1 ? dict.minimumOne : format(dict.minimum, { count: unit.minNights })}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{dict[unit.status]}</p>
                          {unit.totalCents !== null && (
                            <p className="mt-1 text-sm text-site-muted">
                              {format(dict.total, { price: formatPublicPrice(unit.totalCents, date.currency, lang), count: date.nights })}
                            </p>
                          )}
                        </div>
                      </div>
                      {canQuote && (
                        <Link
                          href={{ pathname: `/${lang}/cotizar`, query: { unit: unit.id, checkIn: date.startDate, checkOut: date.endDate } }}
                          className={`${buttonStyles.primary} mt-4 w-full sm:w-auto`}
                        >
                          {dict.quote}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
