"use client";

import { useState } from "react";
import Image from "next/image";
import type { SpaceMeta, SPACE_CATEGORIES } from "@/lib/spaces";

type Category = (typeof SPACE_CATEGORIES)[number]["id"];

type SpaceWithPhotos = SpaceMeta & { photos: string[] };

type Props = {
  spaces: SpaceWithPhotos[];
  categories: typeof SPACE_CATEGORIES;
  lang: string;
  dict: {
    label: string;
    title: string;
    titleItalic: string;
    subtitle: string;
    noPhotos: string;
    capacity: string;
    viewMore: string;
  };
};

export default function Spaces({ spaces, categories, lang, dict }: Props) {
  const [active, setActive] = useState<Category>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const isEs = lang === "es";

  const filtered =
    active === "all"
      ? spaces
      : spaces.filter((s) => s.category === active);

  // Only show categories that have matching spaces
  const visibleCategories = categories.filter(
    (c) => c.id === "all" || spaces.some((s) => s.category === c.id)
  );

  return (
    <section id="spaces" className="py-24 lg:py-32 bg-cream">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">

        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-xs uppercase tracking-[0.2em] text-earth mb-4">{dict.label}</p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-light text-charcoal tracking-tight">
            {dict.title}
            <br />
            <span className="italic text-forest">{dict.titleItalic}</span>
          </h2>
          <p className="mt-5 text-stone text-sm max-w-md mx-auto leading-relaxed">{dict.subtitle}</p>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-10 scrollbar-none justify-center flex-wrap">
          {visibleCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setActive(cat.id as Category); setExpanded(null); }}
              className={`px-5 py-2 rounded-full text-sm tracking-wide whitespace-nowrap transition-all duration-200 ${
                active === cat.id
                  ? "bg-forest text-white shadow-sm"
                  : "bg-white text-stone border border-stone/20 hover:border-forest/40 hover:text-forest"
              }`}
            >
              {cat.label[isEs ? "es" : "en"]}
            </button>
          ))}
        </div>

        {/* Spaces grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((space) => {
            const isExpanded = expanded === space.id;
            const hasPhotos = space.photos.length > 0;
            const coverPhoto = hasPhotos
              ? `/images/${space.folder}/${space.photos[0]}`
              : null;
            const extraPhotos = space.photos.slice(1);

            return (
              <div
                key={space.id}
                className="rounded-2xl overflow-hidden bg-white border border-stone/10 hover:shadow-md transition-all duration-300 flex flex-col"
              >
                {/* Cover photo / placeholder */}
                <div className="relative aspect-[4/3] bg-stone/10 overflow-hidden">
                  {coverPhoto ? (
                    <Image
                      src={coverPhoto}
                      alt={`${space.label[isEs ? "es" : "en"]} — Saywa Lodges, Urubamba, Valle Sagrado`}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-stone/5 to-stone/15">
                      <span className="text-4xl">{space.icon}</span>
                      <p className="text-xs text-stone/50 tracking-wide">
                        {dict.noPhotos}
                      </p>
                    </div>
                  )}

                  {/* Capacity badge */}
                  {space.capacity && (
                    <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/50 text-white text-xs backdrop-blur-sm">
                      {space.capacity} {dict.capacity}
                    </span>
                  )}

                  {/* Photo count badge */}
                  {space.photos.length > 1 && (
                    <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/50 text-white text-xs backdrop-blur-sm">
                      {space.photos.length} fotos
                    </span>
                  )}

                  {/* Category badge */}
                  {space.badge && (
                    <span className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-earth text-white text-xs tracking-wide">
                      {space.badge[isEs ? "es" : "en"]}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-lg leading-none mt-0.5">{space.icon}</span>
                    <h3 className="text-base font-medium text-charcoal leading-tight">
                      {space.label[isEs ? "es" : "en"]}
                    </h3>
                  </div>
                  <p className="text-sm text-stone leading-relaxed flex-1">
                    {space.desc[isEs ? "es" : "en"]}
                  </p>

                  {/* Expand extra photos */}
                  {extraPhotos.length > 0 && (
                    <button
                      onClick={() => setExpanded(isExpanded ? null : space.id)}
                      className="mt-4 text-xs text-forest border-b border-forest/30 pb-0.5 hover:border-forest self-start transition-colors"
                    >
                      {isExpanded
                        ? (isEs ? "Ver menos" : "Show less")
                        : `${dict.viewMore} (${extraPhotos.length})`}
                    </button>
                  )}
                </div>

                {/* Expanded extra photos */}
                {isExpanded && extraPhotos.length > 0 && (
                  <div className="grid grid-cols-2 gap-1 px-1 pb-1">
                    {extraPhotos.map((photo, i) => (
                      <div key={photo} className="relative aspect-[4/3] overflow-hidden rounded-lg bg-stone/10">
                        <Image
                          src={`/images/${space.folder}/${photo}`}
                          alt={`${space.label[isEs ? "es" : "en"]} foto ${i + 2} — Saywa Lodges`}
                          fill
                          sizes="(max-width: 640px) 50vw, 25vw"
                          className="object-cover"
                          loading="lazy"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
