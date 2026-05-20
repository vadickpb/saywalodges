"use client";

import { useState, useEffect, useCallback } from "react";
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

type Lightbox = { spaceId: string; index: number } | null;

export default function Spaces({ spaces, categories, lang, dict }: Props) {
  const [active, setActive] = useState<Category>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<Lightbox>(null);

  const isEs = lang === "es";

  // Compute all photos for the current lightbox space
  const lbSpace = lightbox ? spaces.find((s) => s.id === lightbox.spaceId) : null;
  const lbPhotos = lbSpace ? lbSpace.photos.map((p) => `/images/${lbSpace.folder}/${p}`) : [];
  const lbTotal = lbPhotos.length;

  const openLightbox = useCallback((spaceId: string, index: number) => {
    setLightbox({ spaceId, index });
  }, []);

  const closeLightbox = useCallback(() => setLightbox(null), []);

  const prevPhoto = useCallback(() => {
    setLightbox((lb) => lb && lbTotal > 1 ? { ...lb, index: (lb.index - 1 + lbTotal) % lbTotal } : lb);
  }, [lbTotal]);

  const nextPhoto = useCallback(() => {
    setLightbox((lb) => lb && lbTotal > 1 ? { ...lb, index: (lb.index + 1) % lbTotal } : lb);
  }, [lbTotal]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") prevPhoto();
      if (e.key === "ArrowRight") nextPhoto();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [lightbox, closeLightbox, prevPhoto, nextPhoto]);

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
                    <button
                      onClick={() => openLightbox(space.id, 0)}
                      className="absolute inset-0 w-full h-full group"
                      aria-label={`Ver foto de ${space.label[isEs ? "es" : "en"]}`}
                    >
                      <Image
                        src={coverPhoto}
                        alt={`${space.label[isEs ? "es" : "en"]} — Saywa Lodges, Urubamba, Valle Sagrado`}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                      {/* Hover overlay with zoom icon */}
                      <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/20">
                        <span className="bg-white/90 rounded-full p-2 text-charcoal">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0zm-6-3v6m-3-3h6" />
                          </svg>
                        </span>
                      </span>
                    </button>
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
                      <button
                        key={photo}
                        onClick={() => openLightbox(space.id, i + 1)}
                        className="relative aspect-[4/3] overflow-hidden rounded-lg bg-stone/10 group"
                        aria-label={`Ver foto ${i + 2} de ${space.label[isEs ? "es" : "en"]}`}
                      >
                        <Image
                          src={`/images/${space.folder}/${photo}`}
                          alt={`${space.label[isEs ? "es" : "en"]} foto ${i + 2} — Saywa Lodges`}
                          fill
                          sizes="(max-width: 640px) 50vw, 25vw"
                          className="object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                        />
                        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/20">
                          <span className="bg-white/90 rounded-full p-1.5 text-charcoal">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0zm-6-3v6m-3-3h6" />
                            </svg>
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Lightbox ─────────────────────────────────────────────────── */}
      {lightbox && lbSpace && lbPhotos.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={closeLightbox}
        >
          {/* Photo container */}
          <div
            className="relative w-full h-full flex items-center justify-center p-4 md:p-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative max-w-5xl w-full max-h-[85vh] aspect-[4/3]">
              <Image
                key={lbPhotos[lightbox.index]}
                src={lbPhotos[lightbox.index]}
                alt={`${lbSpace.label[isEs ? "es" : "en"]} — foto ${lightbox.index + 1}`}
                fill
                sizes="100vw"
                className="object-contain"
                priority
              />
            </div>

            {/* Space name + counter */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full text-white text-sm">
              <span>{lbSpace.icon}</span>
              <span className="font-medium">{lbSpace.label[isEs ? "es" : "en"]}</span>
              {lbTotal > 1 && (
                <span className="text-white/60">{lightbox.index + 1} / {lbTotal}</span>
              )}
            </div>

            {/* Prev */}
            {lbTotal > 1 && (
              <button
                onClick={prevPhoto}
                className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/25 backdrop-blur-sm text-white rounded-full p-3 transition-colors"
                aria-label="Foto anterior"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}

            {/* Next */}
            {lbTotal > 1 && (
              <button
                onClick={nextPhoto}
                className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/25 backdrop-blur-sm text-white rounded-full p-3 transition-colors"
                aria-label="Foto siguiente"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}

            {/* Close */}
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 bg-white/10 hover:bg-white/25 backdrop-blur-sm text-white rounded-full p-2.5 transition-colors"
              aria-label="Cerrar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
