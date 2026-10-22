"use client";

import { useState } from "react";
import { Images } from "lucide-react";
import type { Dict } from "@/dictionaries/en";
import { format } from "@/lib/domain/format";
import { Lightbox } from "./lightbox";
import { Container, Photo, SectionHeading } from "./ui";

type Props = { dict: Dict["gallery"]; name: string; photos: string[] };

// Bento mosaic: one large photo + up to four smaller ones, rearranged so
// any count from 1 to 5 fills the grid without holes; the rest are a click
// away in the lightbox.
const MAX_TILES = 5;

function tileClass(i: number, count: number): string {
  if (i === 0) return count === 1 ? "col-span-2 row-span-2 md:col-span-4" : "col-span-2 row-span-2";
  if (count === 2) return "col-span-2 row-span-2";
  if (count === 3) return "col-span-1 md:col-span-2";
  // 4 photos: the last small tile spans the remaining width on desktop.
  if (count === 4 && i === 3) return "hidden md:block md:col-span-2";
  return i >= 3 ? "hidden md:block" : "";
}

export function Gallery({ dict, name, photos }: Props) {
  const [index, setIndex] = useState<number | null>(null);
  if (photos.length === 0) return null;

  const tiles = photos.slice(0, MAX_TILES);

  return (
    <section id="gallery" className="scroll-mt-20 bg-site-surface py-20 sm:py-28">
      <Container>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading label={dict.label} title={dict.title} />
          {photos.length > 1 && (
            <button
              type="button"
              onClick={() => setIndex(0)}
              className="inline-flex items-center gap-2 self-start text-sm font-semibold underline-offset-4 hover:underline sm:self-auto"
            >
              <Images className="size-4" aria-hidden="true" />
              {format(dict.viewAll, { count: photos.length })}
            </button>
          )}
        </div>

        <div className="mt-10 grid auto-rows-[9rem] grid-cols-2 gap-2 sm:auto-rows-[12rem] sm:gap-3 md:grid-cols-4 lg:auto-rows-[15rem]">
          {tiles.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={format(dict.open, { index: i + 1 })}
              className={`group relative overflow-hidden rounded-site focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-accent ${tileClass(i, tiles.length)}`}
            >
              <Photo
                src={src}
                alt=""
                sizes={i === 0 ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 25vw, 50vw"}
                className="transition duration-700 group-hover:scale-105"
              />
            </button>
          ))}
        </div>
      </Container>

      <Lightbox photos={photos} alt={name} index={index} onIndexChange={setIndex} labels={dict} />
    </section>
  );
}
