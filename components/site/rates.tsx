import { MessageCircle } from "lucide-react";
import type { Dict } from "@/dictionaries/en";
import { Container, SectionHeading, buttonStyles } from "./ui";

// Display-ready card: the page formats prices and dates (currency and locale
// belong to the tenant), this component only lays them out.
export type RateCardView = { key: string; title: string; period: string; from: string };

type Props = { dict: Dict["rates"]; cards: RateCardView[]; waUrl: string };

// Rates + the availability call to action. #availability is the CTA band; the
// public calendar (SD-308) renders right after it when the tenant has units.
export function Rates({ dict, cards, waUrl }: Props) {
  return (
    <section id="rates" className="scroll-mt-20 bg-site-surface py-20 sm:py-28">
      <Container>
        {cards.length > 0 && (
          <>
            <SectionHeading label={dict.label} title={dict.title} />
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]">
              {cards.map((card) => (
                <li key={card.key} className="flex flex-col rounded-site border border-site-line bg-site-bg p-7">
                  <p className="text-sm font-semibold">{card.title}</p>
                  {card.period && <p className="mt-1 text-xs text-site-muted">{card.period}</p>}
                  <p className="mt-auto pt-6 font-site-heading text-3xl tracking-tight">{card.from}</p>
                  <p className="mt-1 text-sm text-site-muted">{dict.perNight}</p>
                </li>
              ))}
            </ul>
            <p className="mt-6 max-w-2xl text-sm leading-relaxed text-site-muted">{dict.note}</p>
          </>
        )}

        <div
          id="availability"
          className="mt-14 scroll-mt-24 flex flex-col items-start gap-6 rounded-site bg-site-primary p-8 text-site-primary-fg sm:p-12 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="max-w-xl">
            <h2 className="font-site-heading text-3xl tracking-tight sm:text-4xl">{dict.availabilityTitle}</h2>
            <p className="mt-3 leading-relaxed opacity-90">{dict.availabilityText}</p>
          </div>
          <a href={waUrl} target="_blank" rel="noopener noreferrer" className={`${buttonStyles.accent} shrink-0`}>
            <MessageCircle className="size-4" aria-hidden="true" />
            {dict.availabilityCta}
          </a>
        </div>
      </Container>
    </section>
  );
}
