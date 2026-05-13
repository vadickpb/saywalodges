"use client";

import { useState } from "react";
import { WHATSAPP_URL_EN, WHATSAPP_URL_ES, EMAIL } from "@/config/site";
import type { Dict } from "@/dictionaries/en";

type Props = { dict: Dict["contact"]; lang: string };

export default function ContactSection({ dict, lang }: Props) {
  const [form, setForm] = useState({ name: "", email: "", dates: "", guests: "", message: "" });

  const waUrl = lang === "es" ? WHATSAPP_URL_ES : WHATSAPP_URL_EN;

  function handleMailto(e: React.FormEvent) {
    e.preventDefault();
    const subject = encodeURIComponent(`Saywa Lodges Inquiry – ${form.name}`);
    const body = encodeURIComponent(
      `Name: ${form.name}\nEmail: ${form.email}\nDates: ${form.dates}\nGuests: ${form.guests}\n\n${form.message}`
    );
    window.open(`mailto:${EMAIL}?subject=${subject}&body=${body}`);
  }

  return (
    <section id="contact" className="py-24 lg:py-32 bg-cream">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.2em] text-earth mb-4">{dict.label}</p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-light text-charcoal tracking-tight">
            {dict.title}
            <br />
            <span className="italic text-forest">{dict.titleItalic}</span>
          </h2>
          <p className="mt-6 text-stone text-sm max-w-md mx-auto leading-relaxed">{dict.subtitle}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 max-w-5xl mx-auto">
          {/* WhatsApp preferred */}
          <div className="flex flex-col gap-6">
            <div className="p-8 rounded-2xl bg-forest text-white">
              <p className="text-xs uppercase tracking-[0.2em] text-white/50 mb-3">{dict.preferredLabel}</p>
              <h3 className="text-xl font-light mb-3">{dict.whatsappTitle}</h3>
              <p className="text-white/70 text-sm leading-relaxed mb-6">{dict.whatsappDesc}</p>
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#25D366] text-white text-sm rounded-full hover:bg-[#20BA5A] transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                {dict.whatsappBtn}
              </a>
            </div>

            <div className="p-8 rounded-2xl bg-white border border-stone/10">
              <p className="text-xs uppercase tracking-[0.2em] text-stone mb-3">{dict.emailLabel}</p>
              <p className="text-charcoal text-sm leading-relaxed mb-4">{dict.emailDesc}</p>
              <a href={`mailto:${EMAIL}`} className="text-forest text-sm border-b border-forest/40 pb-0.5 hover:border-forest transition-colors">
                {EMAIL}
              </a>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleMailto} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-stone uppercase tracking-wide">{dict.fieldName}</label>
                <input
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="px-4 py-3 rounded-xl border border-stone/20 bg-white text-sm text-charcoal focus:outline-none focus:border-forest transition-colors"
                  placeholder="John Doe"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-stone uppercase tracking-wide">{dict.fieldGuests}</label>
                <input
                  value={form.guests}
                  onChange={e => setForm(f => ({ ...f, guests: e.target.value }))}
                  className="px-4 py-3 rounded-xl border border-stone/20 bg-white text-sm text-charcoal focus:outline-none focus:border-forest transition-colors"
                  placeholder="2"
                  type="number"
                  min="1"
                  max="10"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-stone uppercase tracking-wide">Email</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="px-4 py-3 rounded-xl border border-stone/20 bg-white text-sm text-charcoal focus:outline-none focus:border-forest transition-colors"
                placeholder="you@email.com"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-stone uppercase tracking-wide">{dict.fieldDates}</label>
              <input
                value={form.dates}
                onChange={e => setForm(f => ({ ...f, dates: e.target.value }))}
                className="px-4 py-3 rounded-xl border border-stone/20 bg-white text-sm text-charcoal focus:outline-none focus:border-forest transition-colors"
                placeholder={dict.datesPlaceholder}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-stone uppercase tracking-wide">{dict.fieldMessage}</label>
              <textarea
                rows={4}
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                className="px-4 py-3 rounded-xl border border-stone/20 bg-white text-sm text-charcoal focus:outline-none focus:border-forest transition-colors resize-none"
                placeholder={dict.messagePlaceholder}
              />
            </div>

            <button
              type="submit"
              className="w-full py-3.5 rounded-full bg-earth text-white text-sm tracking-wide hover:bg-earth/90 transition-colors mt-2"
            >
              {dict.submitBtn}
            </button>
            <p className="text-center text-xs text-stone/60">{dict.submitNote}</p>
          </form>
        </div>
      </div>
    </section>
  );
}
