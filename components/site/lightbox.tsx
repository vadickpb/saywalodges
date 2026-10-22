"use client";

import { useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { format } from "@/lib/domain/format";

export type LightboxLabels = { close: string; previous: string; next: string; position: string };

type Props = {
  photos: string[];
  alt: string;
  // null = closed. Owned by the parent so any trigger can open any photo.
  index: number | null;
  onIndexChange: (index: number | null) => void;
  labels: LightboxLabels;
};

// Native <dialog> gives focus trapping, Escape-to-close and an inert page
// behind it for free; arrow keys and swipe-free buttons cover navigation.
export function Lightbox({ photos, alt, index, onIndexChange, labels }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const count = photos.length;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (index !== null && !dialog.open) dialog.showModal();
    if (index === null && dialog.open) dialog.close();
  }, [index]);

  const step = useCallback(
    (delta: number) => {
      if (index === null) return;
      onIndexChange((index + delta + count) % count);
    },
    [index, count, onIndexChange]
  );

  return (
    <dialog
      ref={ref}
      onClose={() => onIndexChange(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") step(1);
        if (e.key === "ArrowLeft") step(-1);
      }}
      onClick={(e) => e.target === e.currentTarget && onIndexChange(null)}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-black/95 p-0 text-white backdrop:bg-black/80"
    >
      {index !== null && (
        <div className="relative flex h-full flex-col">
          <div className="flex items-center justify-between px-4 py-3 text-sm sm:px-6">
            <span aria-live="polite">{format(labels.position, { index: index + 1, count })}</span>
            <button
              type="button"
              onClick={() => onIndexChange(null)}
              aria-label={labels.close}
              className="rounded-full p-2 hover:bg-white/10"
            >
              <X className="size-6" aria-hidden="true" />
            </button>
          </div>
          <div className="relative min-h-0 flex-1">
            <Image src={photos[index]} alt={alt} fill sizes="100vw" className="object-contain" />
          </div>
          {count > 1 && (
            <div className="flex justify-center gap-4 py-4">
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label={labels.previous}
                className="rounded-full border border-white/30 p-3 hover:bg-white/10"
              >
                <ChevronLeft className="size-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label={labels.next}
                className="rounded-full border border-white/30 p-3 hover:bg-white/10"
              >
                <ChevronRight className="size-5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
