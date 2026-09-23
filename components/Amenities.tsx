import type { Dict } from "@/dictionaries";
import { getAmenities, resolveAmenity } from "@/lib/property";

type Props = { dict: Dict["amenities"]; lang: string; propertyId: string };

export default async function Amenities({ dict, lang, propertyId }: Props) {
  const rows = await getAmenities(propertyId);
  const items = rows.map((row) => resolveAmenity(row, lang));

  return (
    <section id="amenities" className="py-24 lg:py-32 bg-cream">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.2em] text-earth mb-4">{dict.label}</p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-light text-charcoal tracking-tight">
            {dict.title}
            <br />
            <span className="italic text-forest">{dict.titleItalic}</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-12">
          {items.map((item) => (
            <div
              key={item.title}
              className="group flex flex-col items-start gap-4 p-8 rounded-2xl bg-white hover:shadow-md transition-all duration-300 border border-stone/10"
            >
              <div className="text-3xl leading-none" aria-hidden="true">
                {item.icon}
              </div>
              <div>
                <h3 className="text-base font-medium text-charcoal mb-1.5">{item.title}</h3>
                <p className="text-sm text-stone leading-relaxed">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
