import type { Dict } from "@/dictionaries";

type Props = { dict: Dict["location"] };

export default function Location({ dict }: Props) {
  return (
    <section id="location" className="py-24 lg:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-earth mb-4">{dict.label}</p>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-light text-charcoal tracking-tight mb-6">
              {dict.title}
              <br />
              <span className="italic text-forest">{dict.titleItalic}</span>
            </h2>
            <p className="text-stone leading-relaxed mb-8 text-sm max-w-md">{dict.description}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
              {dict.distances.map((d) => (
                <div key={d.place} className="flex items-center gap-3 p-4 rounded-xl bg-cream hover:bg-cream/80 transition-colors duration-200">
                  <span className="text-xl">{d.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-charcoal">{d.place}</p>
                    <p className="text-xs text-stone">{d.time}</p>
                  </div>
                </div>
              ))}
            </div>

            <a
              href="https://maps.google.com/?q=Urubamba,Cusco,Peru"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-forest border-b border-forest/40 pb-0.5 hover:border-forest transition-colors duration-200 tracking-wide"
            >
              {dict.mapsLink}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>

          <div className="relative aspect-square lg:aspect-auto lg:h-[500px] rounded-2xl overflow-hidden bg-stone/10">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `repeating-linear-gradient(0deg,transparent,transparent 39px,#e5e7eb 39px,#e5e7eb 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,#e5e7eb 39px,#e5e7eb 40px)`,
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-br from-forest/10 to-earth/10" />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
              <div className="w-14 h-14 rounded-full bg-earth flex items-center justify-center mb-4 shadow-lg">
                <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                </svg>
              </div>
              <p className="text-forest font-medium text-base">Saywa Lodges</p>
              <p className="text-stone text-sm mt-1">Urubamba, Valle Sagrado</p>
              <p className="text-stone/70 text-xs mt-1">Cusco, Perú · {dict.altitude}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
