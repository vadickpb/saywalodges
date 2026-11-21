import { HeroVideo } from "./hero-video";
import { ArrowRight, MapPin } from "lucide-react";
import { MountainDivider } from "./mountain-divider";
import { Photo, buttonStyles } from "./ui";

type Props = {
  name: string;
  heroUrl: string;
  videoUrl?: string | null;
  videoLabel?: string;
  videoFallback?: string;
  region: string;
  headline: string;
  tagline: string;
  locality: string;
  /** Where "Explorar villas" goes: the villas section when there is one, the gallery otherwise. */
  exploreHref: string;
  exploreLabel: string;
  /** A second photo shown as a framed card on the right (large screens). No caption: the owner's texts are not tied to a particular photo. */
  insetUrl?: string;
};

// SD-1134: left-aligned serif headline over the photo, mountain divider, italic tagline, one clear call to action, and a framed
// second photo. Everything shown comes from the owner's content: nothing is invented here.
export function Hero({ name, heroUrl, videoUrl, videoLabel, videoFallback, region, headline, tagline, locality, exploreHref, exploreLabel, insetUrl }: Props) {
  const onPhoto = Boolean(heroUrl);
  const place = region || locality;
  return (
    <section
      id="top"
      className={`relative isolate flex min-h-[560px] items-center overflow-hidden pb-24 pt-28 sm:min-h-[640px] lg:min-h-[680px] lg:pb-28 lg:pt-32 ${
        onPhoto ? "text-white" : "bg-site-primary text-site-primary-fg"
      }`}
    >
      {onPhoto && (
        <>
          <Photo src={heroUrl} alt={name} sizes="100vw" priority className="-z-20" />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-r from-black/70 via-black/35 to-black/10" />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-t from-black/45 via-transparent to-transparent" />
        </>
      )}

      <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:px-10">
        <div>
          <h1 className="max-w-2xl font-site-heading text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">{headline || name}</h1>
          <MountainDivider className="mt-6 max-w-md" />
          {tagline && <p className="mt-5 max-w-xl font-site-heading text-xl italic leading-relaxed opacity-95 sm:text-2xl">{tagline}</p>}

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <a href={exploreHref} className={`${buttonStyles.accent} px-7! py-3.5!`}>
              {exploreLabel}
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </div>
          {place && (
            <p className="mt-6 flex items-center gap-2 text-sm opacity-90">
              <MapPin className="size-4" strokeWidth={1.75} aria-hidden="true" />
              {place}
            </p>
          )}
          {videoUrl && heroUrl && <div className="mt-6 max-w-xl"><HeroVideo src={videoUrl} poster={heroUrl} label={videoLabel ?? name} fallback={videoFallback ?? name} /></div>}
        </div>

        {insetUrl && (
          <figure className="relative hidden aspect-[4/3] overflow-hidden rounded-site border-4 border-white shadow-2xl lg:block">
            <Photo src={insetUrl} alt="" sizes="(min-width: 1024px) 40vw, 0px" />
          </figure>
        )}
      </div>
    </section>
  );
}
