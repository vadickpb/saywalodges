"use client";

import Image from "next/image";
import { useState } from "react";

// Manual playback, no autoplay or eager download, including reduced-motion users.
// Source and poster must be resolved from tenant media in the server DAL.
export function HeroVideo({ src, poster, label, fallback }: {
  src: string; poster: string; label: string; fallback: string;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (failedSource === src) return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl">
      <Image src={poster} alt={label} fill sizes="(max-width: 768px) 100vw, 80vw" className="object-cover" />
      <p role="status" className="absolute inset-x-0 bottom-0 bg-black/80 p-3 text-white">{fallback}</p>
    </div>
  );
  return (
    <video key={src} src={src} controls playsInline preload="none" poster={poster}
      aria-label={label} className="aspect-video w-full rounded-xl object-cover"
      onError={() => setFailedSource(src)}>
      {fallback}
    </video>
  );
}
