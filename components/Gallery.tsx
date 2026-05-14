import Image from "next/image";
import type { Dict } from "@/dictionaries";
import { getPhotosConfig } from "@/lib/photos";
import { WHATSAPP_URL_EN, WHATSAPP_URL_ES } from "@/config/site";

const ALT_TAGS: Record<string, string> = {
  "foto1.jpeg": "Lodge exterior with garden and Andean landscape",
  "foto2.jpeg": "Outdoor seating area with mountain views",
  "foto3.jpeg": "Private pool with panoramic Sacred Valley views",
  "foto4.jpeg": "Private pool illuminated at night",
  "foto5.jpeg": "Outdoor BBQ area with garden views",
  "foto6.jpeg": "Master bedroom with Sacred Valley view",
  "foto7.jpeg": "Double bedroom with wooden floors",
  "foto8.jpeg": "Twin bedroom with mountain window view",
};

type Props = { dict: Dict["gallery"]; lang: string };

export default async function Gallery({ dict, lang }: Props) {
  const { gallery } = await getPhotosConfig();
  const whatsappUrl = lang === "es" ? WHATSAPP_URL_ES : WHATSAPP_URL_EN;

  return (
    <section id="gallery" className="py-24 lg:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.2em] text-earth mb-4">
            {dict.label}
          </p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-light text-charcoal tracking-tight">
            {dict.title}
            <br />
            <span className="italic text-forest">{dict.titleItalic}</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
          {gallery.map((filename, i) => (
            <div
              key={filename}
              className="relative aspect-[4/3] overflow-hidden rounded-xl bg-stone/10"
            >
              <Image
                src={`/images/${filename}`}
                alt={ALT_TAGS[filename] ?? `Saywa Lodges photo ${i + 1}`}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover hover:scale-105 transition-transform duration-500"
                loading={i < 3 ? "eager" : "lazy"}
              />
              <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors duration-300" />
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-forest border-b border-forest/40 pb-0.5 hover:border-forest transition-colors duration-200 tracking-wide"
          >
            {dict.cta}
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M17 8l4 4m0 0l-4 4m4-4H3"
              />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
