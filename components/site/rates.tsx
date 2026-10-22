import { MessageCircle } from "lucide-react";
import type { Dict } from "@/dictionaries/en";
import { Container, SectionHeading, buttonStyles } from "./ui";

type Tier = { season: string; from: string; period: string; tag: string };

type Props = { dict: Dict["rates"]; tiers: Tier[]; waUrl: string };

// Rates + the availability call to action. Bookings are still confirmed over
// WhatsApp until the booking engine lands (Phase 3), so #availability is a
// CTA band rather than a calendar.
export function Rates({ dict, tiers, waUrl }: Props) {
  return (
    <section id="rates" className="scroll-mt-20 bg-site-surface py-20 sm:py-28">
      <Container>
        {tiers.length > 0 && (
          <>
            <SectionHeading label={dict.label} title={dict.title} />
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]">
              {tiers.map((tier) => (
                <li key={tier.season} className="flex flex-col rounded-site border border-site-line bg-site-bg p-7">
                  <p className="text-sm font-semibold">{tier.season}</p>
                  {tier.tag && <p className="mt-1 text-xs text-site-muted">{tier.tag}</p>}
                  <p className="mt-auto pt-6 font-site-heading text-3xl tracking-tight">{tier.from}</p>
                  {tier.period && <p className="mt-1 text-sm text-site-muted">/ {tier.period}</p>}
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
