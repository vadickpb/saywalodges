import { Check } from "lucide-react";
import type { Dict } from "@/dictionaries/en";
import { SiteIcon } from "./icon";
import { Container } from "./ui";

type Amenity = { icon: string; title: string; description: string };

type Props = {
  dict: Dict["intro"];
  title: string;
  intro: string;
  highlights: string[];
  amenities: Amenity[];
};

export function Intro({ dict, title, intro, highlights, amenities }: Props) {
  if (!intro && highlights.length === 0 && amenities.length === 0) return null;

  return (
    <section id="about" className="scroll-mt-20 py-20 sm:py-28">
      <Container className="grid gap-14 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-site-accent">{dict.label}</p>
          <h2 className="mt-3 font-site-heading text-3xl leading-tight tracking-tight sm:text-4xl">{title}</h2>
          {intro && <p className="mt-6 text-base leading-relaxed text-site-muted sm:text-lg">{intro}</p>}
          {highlights.length > 0 && (
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {highlights.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm font-medium">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-site-primary text-site-primary-fg">
                    <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>

        {amenities.length > 0 && (
          <div className="lg:col-span-7">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-site-muted">{dict.amenities}</h3>
            <ul className="mt-6 grid gap-px overflow-hidden rounded-site border border-site-line bg-site-line sm:grid-cols-2">
              {amenities.map((amenity) => (
                <li key={amenity.title} className="flex gap-4 bg-site-bg p-6">
                  <SiteIcon emoji={amenity.icon} className="size-7 shrink-0 text-site-primary" />
                  <div>
                    <p className="font-semibold">{amenity.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-site-muted">{amenity.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Container>
    </section>
  );
}
