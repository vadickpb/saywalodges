import { ArrowUpRight, MapPin } from "lucide-react";
import type { Dict } from "@/dictionaries/en";
import { SiteIcon } from "./icon";
import { Container, SectionHeading, buttonStyles } from "./ui";

type Distance = { place: string; time: string; icon: string };

type Props = {
  dict: Dict["location"];
  blurb: string;
  address: string;
  mapsUrl: string;
  distances: Distance[];
};

export function Location({ dict, blurb, address, mapsUrl, distances }: Props) {
  return (
    <section id="location" className="scroll-mt-20 py-20 sm:py-28">
      <Container className="grid gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionHeading label={dict.label} title={dict.title} />
          {address && (
            <p className="mt-6 inline-flex items-center gap-2 font-semibold">
              <MapPin className="size-5 text-site-primary" strokeWidth={1.5} aria-hidden="true" />
              {address}
            </p>
          )}
          {blurb && <p className="mt-4 text-base leading-relaxed text-site-muted sm:text-lg">{blurb}</p>}
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={`${buttonStyles.outline} mt-8`}>
              {dict.maps}
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
          )}
        </div>

        {distances.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-site-muted">{dict.nearby}</h3>
            <ul className="mt-6 divide-y divide-site-line border-y border-site-line">
              {distances.map((d) => (
                <li key={d.place} className="flex items-center justify-between gap-4 py-4">
                  <span className="flex items-center gap-3">
                    <SiteIcon emoji={d.icon} className="size-5 text-site-primary" />
                    {d.place}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-site-muted">{d.time}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Container>
    </section>
  );
}
