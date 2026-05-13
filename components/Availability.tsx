import { AIRBNB_URL, WHATSAPP_URL_EN } from "@/config/site";
import type { Dict } from "@/dictionaries";

type Props = { dict: Dict["availability"] };

export default function Availability({ dict }: Props) {
  return (
    <section id="availability" className="py-24 lg:py-32 bg-white">
      <div className="max-w-5xl mx-auto px-6 lg:px-10">
        <div className="text-center mb-12">
          <p className="text-xs uppercase tracking-[0.2em] text-earth mb-4">{dict.label}</p>
          <h2 className="text-3xl md:text-4xl font-light text-charcoal tracking-tight">
            {dict.title}
            <br />
            <span className="italic text-forest">{dict.titleItalic}</span>
          </h2>
          <p className="mt-5 text-stone text-sm max-w-md mx-auto leading-relaxed">{dict.subtitle}</p>
        </div>

        {AIRBNB_URL ? (
          <div className="rounded-2xl overflow-hidden border border-stone/10 shadow-sm">
            <iframe
              src={`${AIRBNB_URL}?enableIframeModal=true`}
              className="w-full h-[600px] border-0"
              title="Airbnb availability calendar"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-stone/20 p-12 text-center bg-cream/50">
            <div className="w-16 h-16 rounded-full bg-earth/10 flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-earth" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-base font-medium text-charcoal mb-2">{dict.placeholderTitle}</h3>
            <p className="text-stone text-sm max-w-sm mx-auto mb-6 leading-relaxed">{dict.placeholderDesc}</p>
            <a
              href={WHATSAPP_URL_EN}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-forest text-white text-sm rounded-full hover:bg-forest/90 transition-colors"
            >
              {dict.placeholderBtn}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
