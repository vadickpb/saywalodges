import Image from "next/image";
import Link from "next/link";
import type { Dict } from "@/dictionaries";
import { getPhotosConfig } from "@/lib/photos";
import { WHATSAPP_URL_EN, WHATSAPP_URL_ES } from "@/config/site";

type Props = { dict: Dict["hero"]; lang: string };

export default async function Hero({ dict, lang }: Props) {
  const { hero } = await getPhotosConfig();
  const whatsappUrl = lang === "es" ? WHATSAPP_URL_ES : WHATSAPP_URL_EN;

  return (
    <section
      id="hero"
      className="relative h-screen min-h-[600px] flex items-center justify-center overflow-hidden"
    >
      {/* LCP image — load with high priority so Lighthouse scores correctly */}
      <Image
        src={`/images/${hero}`}
        alt="Saywa Lodges — private pool and mountain views, Valle Sagrado, Cusco"
        fill
        priority
        fetchPriority="high"
        sizes="100vw"
        className="object-cover"
      />

      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/60" />

      <div className="relative z-10 text-center text-white px-6 max-w-3xl mx-auto">
        <p className="text-sm uppercase tracking-[0.25em] text-white/70 mb-6 font-light">
          {dict.label}
        </p>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-light leading-tight mb-6 tracking-tight">
          {dict.title}
          <br />
          <span className="italic">{dict.titleItalic}</span>
        </h1>
        <p className="text-lg md:text-xl text-white/80 font-light mb-10 tracking-wide">
          {dict.subtitle}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-earth text-white text-sm tracking-wide rounded-full hover:bg-earth/90 transition-all duration-200"
          >
            <svg
              className="w-5 h-5"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            {dict.whatsapp}
          </a>
          <Link
            href="#gallery"
            className="inline-flex items-center justify-center px-8 py-3.5 border border-white/60 text-white text-sm tracking-wide rounded-full hover:bg-white/10 transition-all duration-200"
          >
            {dict.viewGallery}
          </Link>
        </div>
      </div>

      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/50 animate-bounce"
        aria-hidden="true"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>
    </section>
  );
}
