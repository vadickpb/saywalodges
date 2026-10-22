"use client";

import { useState } from "react";
import { Images, Users } from "lucide-react";
import type { Dict } from "@/dictionaries/en";
import { format } from "@/lib/domain/format";
import { SiteIcon } from "./icon";
import { Lightbox, type LightboxLabels } from "./lightbox";
import { Container, Photo, SectionHeading } from "./ui";

export type SpaceCard = {
  id: string;
  icon: string;
  name: string;
  description: string;
  capacity?: string;
  badge?: string;
  photos: string[];
};

type Props = {
  dict: Dict["spaces"];
  lightboxLabels: LightboxLabels;
  intro: string;
  spaces: SpaceCard[];
};

export function Spaces({ dict, lightboxLabels, intro, spaces }: Props) {
  const [open, setOpen] = useState<{ space: SpaceCard; index: number } | null>(null);
  if (spaces.length === 0) return null;

  return (
    <section id="spaces" className="scroll-mt-20 py-20 sm:py-28">
      <Container>
        <SectionHeading label={dict.label} title={dict.title} />
        {intro && <p className="mt-5 max-w-2xl text-base leading-relaxed text-site-muted sm:text-lg">{intro}</p>}

        <ul className="mt-12 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {spaces.map((space) => {
            const hasPhotos = space.photos.length > 0;
            return (
              <li key={space.id} className="flex flex-col">
                <button
                  type="button"
                  disabled={!hasPhotos}
                  onClick={() => setOpen({ space, index: 0 })}
                  aria-label={format(dict.open, { name: space.name })}
                  className="group relative aspect-[4/3] overflow-hidden rounded-site enabled:cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-accent"
                >
                  <Photo
                    src={space.photos[0]}
                    alt=""
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="transition duration-700 group-hover:scale-105"
                    placeholderLabel={dict.noPhotos}
                  />
                  {space.badge && (
                    <span className="absolute left-3 top-3 rounded-full bg-site-bg px-3 py-1 text-xs font-semibold text-site-fg shadow-sm">
                      {space.badge}
                    </span>
                  )}
                  {space.photos.length > 1 && (
                    <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                      <Images className="size-3.5" aria-hidden="true" />
                      {format(dict.photos, { count: space.photos.length })}
                    </span>
                  )}
                </button>
                <div className="mt-5 flex items-start gap-3">
                  <SiteIcon emoji={space.icon} className="mt-1 size-5 shrink-0 text-site-primary" />
                  <div>
                    <h3 className="font-site-heading text-xl tracking-tight">{space.name}</h3>
                    {space.capacity && (
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-site-accent">
                        <Users className="size-3.5" aria-hidden="true" />
                        {format(dict.sleeps, { count: space.capacity })}
                      </p>
                    )}
                    <p className="mt-2 text-sm leading-relaxed text-site-muted">{space.description}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Container>

      <Lightbox
        photos={open?.space.photos ?? []}
        alt={open?.space.name ?? ""}
        index={open?.index ?? null}
        onIndexChange={(index) => setOpen(index === null || !open ? null : { space: open.space, index })}
        labels={lightboxLabels}
      />
    </section>
  );
}
