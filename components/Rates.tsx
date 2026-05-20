import type { Dict } from "@/dictionaries/en";
import { WHATSAPP_URL_EN, WHATSAPP_URL_ES } from "@/config/site";

type Props = { dict: Dict["rates"]; lang: string };

export default function Rates({ dict, lang }: Props) {
  const waUrl = lang === "es" ? WHATSAPP_URL_ES : WHATSAPP_URL_EN;

  return (
    <section id="rates" className="py-24 lg:py-32 bg-white">
      <div className="max-w-3xl mx-auto px-6 lg:px-10">

        {/* Header */}
        <div className="text-center mb-14">
          <p className="text-xs uppercase tracking-[0.2em] text-earth mb-4">{dict.label}</p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-light text-charcoal tracking-tight">
            {dict.title}
            <br />
            <span className="italic text-forest">{dict.titleItalic}</span>
          </h2>
          <p className="mt-5 text-stone text-sm max-w-md mx-auto leading-relaxed">
            {dict.subtitle}
          </p>
          {/* Capacity pill */}
          <div className="mt-5 inline-flex items-center gap-2 bg-forest/10 text-forest text-xs px-4 py-2 rounded-full font-medium tracking-wide">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-1a4 4 0 0 0-4-4h-1M9 20H4v-1a4 4 0 0 1 4-4h1m4-4a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm6 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 15a3 3 0 1 1 6 0" />
            </svg>
            {dict.capacity}
          </div>
        </div>

        {/* Rate tiers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          {dict.tiers.map((tier, i) => {
            const highlighted = i === 1; // High season
            return (
              <div
                key={i}
                className={`relative rounded-2xl p-7 flex flex-col gap-2 transition-all duration-300 ${
                  highlighted
                    ? "bg-forest text-white shadow-lg"
                    : "bg-[#f8f6f1] border border-stone/10 text-charcoal hover:shadow-sm"
                }`}
              >
                {/* Tag */}
                {tier.tag && (
                  <span
                    className={`self-start text-xs px-2.5 py-0.5 rounded-full mb-1 ${
                      highlighted
                        ? "bg-white/15 text-white/90"
                        : "bg-earth/15 text-earth"
                    }`}
                  >
                    {tier.tag}
                  </span>
                )}

                {/* Season label */}
                <p className={`text-sm font-medium ${highlighted ? "text-white/75" : "text-stone"}`}>
                  {tier.season}
                </p>

                {/* Price */}
                <p className={`text-2xl font-light tracking-tight ${highlighted ? "text-white" : "text-charcoal"}`}>
                  {tier.from}
                  {tier.period && (
                    <span className={`text-base font-normal ${highlighted ? "text-white/55" : "text-stone/60"}`}>
                      {" /"}{tier.period}
                    </span>
                  )}
                </p>
              </div>
            );
          })}
        </div>

        {/* CTA block */}
        <div className="rounded-2xl border border-forest/15 bg-forest/5 px-8 py-10 text-center">
          <p className="text-sm text-stone leading-relaxed mb-7 max-w-xs mx-auto">
            {dict.note}
          </p>
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 bg-[#25D366] hover:bg-[#1ebe5d] active:scale-95 text-white text-sm font-medium px-7 py-3.5 rounded-full transition-all duration-200 shadow-sm"
          >
            {/* WhatsApp icon */}
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.985-1.418A9.956 9.956 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.946 7.946 0 0 1-4.031-1.093l-.29-.172-2.958.841.857-2.878-.189-.296A7.951 7.951 0 0 1 4 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z"/>
            </svg>
            {dict.cta}
          </a>
        </div>

      </div>
    </section>
  );
}
