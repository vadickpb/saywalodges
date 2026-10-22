import { BedDouble, MapPin, MessageCircle, Users } from "lucide-react";
import type { Dict } from "@/dictionaries/en";
import { format } from "@/lib/domain/format";
import { Photo, buttonStyles } from "./ui";

type Props = {
  dict: Dict["hero"];
  name: string;
  heroUrl: string;
  region: string;
  headline: string;
  tagline: string;
  capacity: number | undefined;
  bedrooms: number;
  locality: string;
  waUrl: string;
};

export function Hero({ dict, name, heroUrl, region, headline, tagline, capacity, bedrooms, locality, waUrl }: Props) {
  const facts = [
    capacity ? { icon: Users, text: format(dict.guests, { count: capacity }) } : null,
    bedrooms > 0
      ? { icon: BedDouble, text: bedrooms === 1 ? dict.bedroom : format(dict.bedrooms, { count: bedrooms }) }
      : null,
    locality ? { icon: MapPin, text: locality } : null,
  ].filter((fact) => fact !== null);

  // Without a photo the hero sits on the tenant's primary color, so text
  // takes its computed foreground instead of assuming white-on-dark-photo.
  const onPhoto = Boolean(heroUrl);

  return (
    <section
      id="top"
      className={`relative isolate flex min-h-[88svh] items-end overflow-hidden lg:min-h-[92svh] ${
        onPhoto ? "text-white" : "bg-site-primary text-site-primary-fg"
      }`}
    >
      {onPhoto && (
        <>
          <Photo src={heroUrl} alt={name} sizes="100vw" priority className="-z-20" />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-linear-to-t from-black/85 via-black/35 to-black/30"
          />
        </>
      )}

      <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-32 sm:px-6 sm:pb-14 lg:px-10 lg:pb-20">
        {region && (
          <p className="text-xs font-semibold uppercase tracking-[0.25em] opacity-90 sm:text-sm">{region}</p>
        )}
        <h1 className="mt-4 max-w-4xl font-site-heading text-4xl leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
          {headline || name}
        </h1>
        {tagline && <p className="mt-5 max-w-2xl text-lg leading-relaxed opacity-90 sm:text-xl">{tagline}</p>}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a href={waUrl} target="_blank" rel="noopener noreferrer" className={buttonStyles.light}>
            <MessageCircle className="size-4" aria-hidden="true" />
            {dict.whatsapp}
          </a>
          <a href="#gallery" className={onPhoto ? buttonStyles.glass : buttonStyles.outline}>
            {dict.viewPhotos}
          </a>
        </div>

        {facts.length > 0 && (
          <ul className="mt-10 flex flex-wrap gap-x-8 gap-y-3 border-t border-current/25 pt-6 text-sm sm:text-base">
            {facts.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2.5">
                <Icon className="size-5 opacity-80" strokeWidth={1.5} aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
