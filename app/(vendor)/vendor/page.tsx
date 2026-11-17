import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  Globe2,
  KeyRound,
  MessageCircle,
  WalletCards,
} from "lucide-react";
import { PRODUCT_NAME } from "@/config/site";
import { vendorDictionaries } from "@/dictionaries/vendor";
import { env } from "@/lib/env";

const copy = vendorDictionaries.es;
const moduleIcons = {
  web: Globe2,
  calendar: CalendarDays,
  bookings: KeyRound,
  finance: BarChart3,
  guide: WalletCards,
  whatsapp: MessageCircle,
};

const buttonBase =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-4";

export default function VendorHomePage() {
  const whatsappMessage = copy.contact.whatsappMessage.replace("{product}", PRODUCT_NAME);
  const whatsappHref = env.VENDOR_WHATSAPP_NUMBER
    ? `https://wa.me/${env.VENDOR_WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappMessage)}`
    : null;
  const emailHref = env.VENDOR_CONTACT_EMAIL
    ? `mailto:${env.VENDOR_CONTACT_EMAIL}?subject=${encodeURIComponent(`${copy.contact.mailSubject} · ${PRODUCT_NAME}`)}`
    : null;
  const quoteHref = whatsappHref ?? emailHref ?? "#contacto";

  return (
    <main className="overflow-hidden">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <a href="#inicio" className="text-lg font-bold tracking-tight text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
            {PRODUCT_NAME}
          </a>
          <nav aria-label="Navegación principal" className="hidden items-center gap-7 text-sm font-medium text-white/85 md:flex">
            <a className="transition hover:text-white" href="#como-funciona">{copy.nav.how}</a>
            <a className="transition hover:text-white" href="#modulos">{copy.nav.modules}</a>
            <a className="transition hover:text-white" href="#contacto">{copy.nav.contact}</a>
          </nav>
          <a href={quoteHref} className={`${buttonBase} min-h-10 bg-white px-4 py-2 text-forest hover:bg-cream focus-visible:outline-white`}>
            {copy.hero.quote}
          </a>
        </div>
      </header>

      <section id="inicio" className="relative isolate bg-forest px-5 pb-20 pt-32 text-white sm:px-8 sm:pb-28 sm:pt-40">
        <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -right-32 -top-32 size-96 rounded-full bg-earth/35 blur-3xl" />
          <div className="absolute -bottom-44 -left-32 size-[30rem] rounded-full bg-white/10 blur-3xl" />
          <div className="absolute inset-0 opacity-15 [background-image:linear-gradient(rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:52px_52px]" />
        </div>
        <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-amber-200">{copy.hero.eyebrow}</p>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              {copy.hero.title}
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-white/80 sm:text-xl">{copy.hero.description}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a href={quoteHref} className={`${buttonBase} bg-amber-300 text-forest hover:bg-amber-200 focus-visible:outline-amber-200`}>
                {copy.hero.quote}<ArrowRight aria-hidden="true" className="size-4" />
              </a>
              {env.VENDOR_DEMO_URL ? (
                <a href={env.VENDOR_DEMO_URL} className={`${buttonBase} border border-white/35 bg-white/10 text-white hover:bg-white/20 focus-visible:outline-white`}>
                  {copy.hero.demo}
                </a>
              ) : null}
              {whatsappHref ? (
                <a href={whatsappHref} className={`${buttonBase} text-white hover:bg-white/10 focus-visible:outline-white`}>
                  <MessageCircle aria-hidden="true" className="size-5" />{copy.hero.whatsapp}
                </a>
              ) : null}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-lg" aria-label={copy.hero.previewLabel}>
            <div className="rounded-[2rem] border border-white/20 bg-white/10 p-3 shadow-2xl shadow-black/20 backdrop-blur-sm">
              <div className="rounded-[1.45rem] bg-cream p-5 text-charcoal sm:p-7">
                <div className="mb-7 flex items-center justify-between">
                  <div><p className="text-xs font-semibold uppercase tracking-widest text-stone">{PRODUCT_NAME}</p><p className="mt-1 font-semibold">{copy.hero.previewLabel}</p></div>
                  <span className="rounded-full bg-forest/10 p-2 text-forest"><CalendarDays aria-hidden="true" className="size-5" /></span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[copy.hero.directBooking, copy.hero.airbnb].map((label) => (
                    <div key={label} className="rounded-2xl border border-black/10 bg-white p-4">
                      <div className="mb-4 h-2 w-12 rounded-full bg-earth/50" />
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="mt-1 text-xs text-stone">{copy.hero.available}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-2xl bg-forest p-5 text-white">
                  <div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-white/15"><Check aria-hidden="true" className="size-4" /></span><p className="text-sm font-medium">Web · Calendario · Reservas</p></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-earth">{copy.how.eyebrow}</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-forest sm:text-5xl">{copy.how.title}</h2>
            <p className="mt-5 text-lg leading-8 text-stone">{copy.how.description}</p>
          </div>
          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {copy.how.steps.map((step, index) => (
              <li key={step.title} className="rounded-3xl border border-forest/10 bg-white p-7 shadow-sm">
                <span className="grid size-10 place-items-center rounded-full bg-forest text-sm font-bold text-white">{index + 1}</span>
                <h3 className="mt-6 text-xl font-semibold text-forest">{step.title}</h3>
                <p className="mt-3 leading-7 text-stone">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="modulos" className="bg-white px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-earth">{copy.modules.eyebrow}</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-forest sm:text-5xl">{copy.modules.title}</h2>
            <p className="mt-5 text-lg leading-8 text-stone">{copy.modules.description}</p>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-forest/10 bg-forest/10 sm:grid-cols-2 lg:grid-cols-3">
            {copy.modules.items.map((item) => {
              const Icon = moduleIcons[item.key];
              return (
                <article key={item.key} className="bg-cream p-7 sm:p-8">
                  <span className="grid size-11 place-items-center rounded-2xl bg-forest text-white"><Icon aria-hidden="true" className="size-5" /></span>
                  <h3 className="mt-6 text-xl font-semibold text-forest">{item.title}</h3>
                  <p className="mt-3 leading-7 text-stone">{item.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="contacto" className="px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-forest px-6 py-12 text-white sm:px-12 sm:py-16 lg:flex lg:items-end lg:justify-between lg:gap-16">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-200">{copy.contact.eyebrow}</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">{copy.contact.title}</h2>
            <p className="mt-5 text-lg leading-8 text-white/75">{copy.contact.description}</p>
          </div>
          <div className="mt-8 flex shrink-0 flex-col gap-3 sm:flex-row lg:mt-0 lg:flex-col">
            {whatsappHref || emailHref ? (
              <a href={quoteHref} className={`${buttonBase} bg-amber-300 text-forest hover:bg-amber-200 focus-visible:outline-amber-200`}>
                {copy.contact.quote}<ArrowRight aria-hidden="true" className="size-4" />
              </a>
            ) : null}
            {whatsappHref ? (
              <a href={whatsappHref} className={`${buttonBase} border border-white/30 text-white hover:bg-white/10 focus-visible:outline-white`}>
                <MessageCircle aria-hidden="true" className="size-5" />{copy.contact.whatsapp}
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <footer className="border-t border-forest/10 px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 text-sm text-stone sm:flex-row sm:items-center sm:justify-between">
          <p className="font-semibold text-forest">{PRODUCT_NAME}</p>
          <p>{copy.footer}</p>
        </div>
      </footer>
    </main>
  );
}
