import type { Dict } from "@/dictionaries";
import { WHATSAPP_NUMBER, WHATSAPP_MESSAGE_EN, WHATSAPP_MESSAGE_ES } from "@/config/site";

type Props = { dict: Dict["rates"]; lang: string };

export default function Rates({ dict, lang }: Props) {
  const waMessage = lang === "es" ? WHATSAPP_MESSAGE_ES : WHATSAPP_MESSAGE_EN;

  return (
    <section id="rates" className="py-24 lg:py-32 bg-cream">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.2em] text-earth mb-4">{dict.label}</p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-light text-charcoal tracking-tight">
            {dict.title}
            <br />
            <span className="italic text-forest">{dict.titleItalic}</span>
          </h2>
          <p className="mt-6 text-stone text-sm max-w-md mx-auto leading-relaxed">{dict.note}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
          {dict.plans.map((plan, i) => {
            const highlighted = i === 1;
            const planMsg = `${waMessage} — ${plan.name}`;
            return (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-2xl overflow-hidden transition-all duration-300 ${
                  highlighted
                    ? "bg-forest text-white shadow-xl ring-2 ring-forest scale-105"
                    : "bg-white text-charcoal border border-stone/10 hover:shadow-md"
                }`}
              >
                {highlighted && <div className="absolute top-0 left-0 right-0 h-1 bg-earth" />}

                <div className="p-8 flex-1">
                  <p className={`text-xs uppercase tracking-[0.15em] mb-2 ${highlighted ? "text-white/60" : "text-stone"}`}>
                    {plan.description}
                  </p>
                  <h3 className={`text-xl font-medium mb-6 ${highlighted ? "text-white" : "text-charcoal"}`}>
                    {plan.name}
                  </h3>

                  <div className="flex items-baseline gap-1 mb-8">
                    <span className={`text-sm ${highlighted ? "text-white/70" : "text-stone"}`}>USD</span>
                    <span className={`text-5xl font-light tracking-tight ${highlighted ? "text-white" : "text-charcoal"}`}>
                      {plan.price}
                    </span>
                    <span className={`text-sm ${highlighted ? "text-white/70" : "text-stone"}`}>/{plan.period}</span>
                  </div>

                  <ul className="space-y-3">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm">
                        <svg className={`w-4 h-4 mt-0.5 shrink-0 ${highlighted ? "text-earth" : "text-forest"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className={highlighted ? "text-white/85" : "text-stone"}>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="px-8 pb-8">
                  <a
                    href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(planMsg)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`block text-center text-sm tracking-wide py-3 rounded-full transition-all duration-200 ${
                      highlighted
                        ? "bg-earth text-white hover:bg-earth/90"
                        : "border border-forest text-forest hover:bg-forest hover:text-white"
                    }`}
                  >
                    {plan.cta}
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center mt-10 text-xs text-stone/70">{dict.bottomNote}</p>
      </div>
    </section>
  );
}
