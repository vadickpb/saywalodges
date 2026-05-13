import Image from "next/image";
import type { Dict } from "@/dictionaries";

const photos = [
  { src: "/images/gallery-pool.svg", alt: "Private pool with Sacred Valley views" },
  { src: "/images/gallery-kitchen.svg", alt: "Fully equipped kitchen" },
  { src: "/images/gallery-bedroom.svg", alt: "Master bedroom with mountain view" },
  { src: "/images/gallery-terrace.svg", alt: "Mountain terrace panoramic view" },
  { src: "/images/gallery-valley.svg", alt: "Sacred Valley views from the lodge" },
  { src: "/images/gallery-exterior.svg", alt: "Lodge exterior" },
];

type Props = { dict: Dict["gallery"] };

export default function Gallery({ dict }: Props) {
  return (
    <section id="gallery" className="py-24 lg:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.2em] text-earth mb-4">{dict.label}</p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-light text-charcoal tracking-tight">
            {dict.title}
            <br />
            <span className="italic text-forest">{dict.titleItalic}</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
          {photos.map((photo) => (
            <div
              key={photo.src}
              className="relative aspect-[4/3] overflow-hidden rounded-xl bg-stone/10"
            >
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover hover:scale-105 transition-transform duration-500"
                loading="lazy"
                unoptimized
              />
              <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors duration-300" />
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <a
            href="https://wa.me/51999999999"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-forest border-b border-forest/40 pb-0.5 hover:border-forest transition-colors duration-200 tracking-wide"
          >
            {dict.cta}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
