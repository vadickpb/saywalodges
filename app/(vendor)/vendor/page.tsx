import {
  ArrowRight,
  Building2,
  CalendarCheck2,
  Check,
  ChevronDown,
  CircleDollarSign,
  Globe2,
  Mail,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { SITE_URL } from "@/config/site";
import { vendorDictionaries } from "@/dictionaries/vendor";
import { env } from "@/lib/env";
import { toJsonLd } from "@/lib/json-ld";

const copy = vendorDictionaries.es;
const title = "HostStay | Software para anfitriones de Airbnb y alquileres vacacionales";
const description = "HostStay reúne reservas, calendarios, huéspedes, finanzas y tu web propia en un solo software para anfitriones de alquileres vacacionales.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title,
  description,
  alternates: { canonical: "/" },
  icons: { icon: [{ url: "/images/hoststay-icon", type: "image/svg+xml" }] },
  openGraph: {
    type: "website", locale: "es_PE", url: "/", siteName: "HostStay", title, description,
    images: [{ url: "/images/hoststay-og", width: 1200, height: 630, alt: "HostStay — Todo tu negocio de alquileres vacacionales, en un solo lugar" }],
  },
  twitter: { card: "summary_large_image", title, description, images: ["/images/hoststay-og"] },
};

const featureIcons = {
  properties: Building2,
  calendar: CalendarCheck2,
  finance: CircleDollarSign,
  website: Globe2,
  channels: RefreshCw,
};

const buttonBase =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-colors";

function Wordmark({ inverse = false }: { inverse?: boolean }) {
  return (
    <svg aria-label="HostStay" className="h-7 w-auto sm:h-9" role="img" viewBox="0 0 184 40">
      <path d="M4 19.5 20 6l16 13.5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-15Z" fill="none" stroke="#14B8A6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      <path d="M14 36V24h12v12M27 11.5v-5h5v9" fill="none" stroke="#14B8A6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      <text className="hoststay-wordmark" fill={inverse ? "#FFFFFF" : "#0B1F33"} fontSize="22" fontWeight="800" x="45" y="28">Host</text>
      <text className="hoststay-wordmark" fill="#14B8A6" fontSize="22" fontWeight="800" x="96" y="28">Stay</text>
    </svg>
  );
}

function DashboardPreview() {
  return (
    <div aria-label={copy.hero.previewLabel} className="relative mx-auto w-full max-w-xl" role="img">
      <div aria-hidden="true" className="hoststay-dashboard-glow absolute -inset-10 -z-10 rounded-full bg-[#14B8A6]/20 blur-3xl" />
      <div className="overflow-hidden rounded-[1.75rem] border border-white/20 bg-white p-2 shadow-2xl shadow-[#061321]/40 sm:p-3">
        <div className="rounded-[1.25rem] bg-[#F6F9FC] p-4 text-[#0B1F33] sm:p-6">
          <div className="flex items-center justify-between border-b border-[#0B1F33]/10 pb-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-[#0B1F33] text-xs font-extrabold text-white">HS</span>
              <div><p className="text-xs font-bold text-[#5B6B7D]">HostStay</p><p className="text-sm font-bold">{copy.hero.overview}</p></div>
            </div>
            <span className="flex items-center gap-2 rounded-full bg-[#14B8A6]/15 px-3 py-1 text-xs font-bold text-[#096B62]"><Check aria-hidden="true" className="size-3.5" />{copy.hero.upToDate}</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1.35fr_.65fr]">
            <div className="rounded-2xl border border-[#0B1F33]/10 bg-white p-4">
              <div className="mb-4 flex items-center justify-between"><p className="text-sm font-bold">{copy.hero.calendar}</p><CalendarCheck2 aria-hidden="true" className="size-5 text-[#14B8A6]" /></div>
              <div className="grid grid-cols-7 gap-1.5" aria-hidden="true">
                {copy.hero.weekdays.map((day, index) => <span className="text-center text-[10px] font-bold text-[#5B6B7D]" key={`${day}-${index}`}>{day}</span>)}
                {Array.from({ length: 21 }, (_, index) => (
                  <span className={`h-7 rounded-md ${index > 7 && index < 12 ? "bg-[#14B8A6]" : index > 14 && index < 18 ? "bg-[#12385F]" : "bg-[#E8EFF6]"}`} key={index} />
                ))}
              </div>
              <div className="mt-4 flex gap-4 text-[11px] font-semibold text-[#5B6B7D]"><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[#14B8A6]" />{copy.hero.direct}</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[#12385F]" />{copy.hero.airbnb}</span></div>
            </div>
            <div className="grid gap-3">
              {[{ label: copy.hero.bookings, icon: UsersRound }, { label: copy.hero.income, icon: CircleDollarSign }].map(({ label, icon: Icon }) => (
                <div className="rounded-2xl border border-[#0B1F33]/10 bg-white p-4" key={label}>
                  <Icon aria-hidden="true" className="size-5 text-[#14B8A6]" /><p className="mt-4 text-xs font-bold text-[#5B6B7D]">{label}</p>
                  <div aria-hidden="true" className="mt-3 flex h-8 items-end gap-1.5"><span className="h-3 w-full rounded-sm bg-[#14B8A6]/25" /><span className="h-6 w-full rounded-sm bg-[#14B8A6]/45" /><span className="h-4 w-full rounded-sm bg-[#14B8A6]/70" /><span className="h-8 w-full rounded-sm bg-[#14B8A6]" /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function VendorHomePage() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const whatsappHref = env.VENDOR_WHATSAPP_NUMBER
    ? `https://wa.me/${env.VENDOR_WHATSAPP_NUMBER}?text=${encodeURIComponent(copy.contact.whatsappMessage)}`
    : null;
  const emailHref = env.VENDOR_CONTACT_EMAIL
    ? `mailto:${env.VENDOR_CONTACT_EMAIL}?subject=${encodeURIComponent(copy.contact.mailSubject)}`
    : null;
  const quoteHref = whatsappHref ?? emailHref;
  const organizationId = new URL("/#organization", SITE_URL).toString();
  const softwareId = new URL("/#software", SITE_URL).toString();
  const faqId = new URL("/#faq", SITE_URL).toString();
  const contactPoint = {
    "@type": "ContactPoint",
    contactType: "sales",
    availableLanguage: ["Spanish", "English"],
    ...(env.VENDOR_WHATSAPP_NUMBER ? { telephone: `+${env.VENDOR_WHATSAPP_NUMBER}` } : {}),
    ...(env.VENDOR_CONTACT_EMAIL ? { email: env.VENDOR_CONTACT_EMAIL } : {}),
  };
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization", "@id": organizationId, name: "HostStay", url: SITE_URL,
        logo: new URL("/images/hoststay-icon", SITE_URL).toString(), ...(whatsappHref || emailHref ? { contactPoint } : {}),
      },
      {
        "@type": "SoftwareApplication", "@id": softwareId, name: "HostStay", url: SITE_URL,
        applicationCategory: "BusinessApplication", operatingSystem: "Web",
        description: copy.hero.description, provider: { "@id": organizationId },
      },
      {
        "@type": "FAQPage", "@id": faqId,
        mainEntity: copy.faq.items.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })),
      },
    ],
  };

  return (
    <>
      <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(structuredData) }} />
      <a className="fixed left-4 top-3 z-[60] -translate-y-20 rounded-lg bg-white px-4 py-3 font-bold text-[#0B1F33] shadow-lg transition-transform focus:translate-y-0" href="#contenido">{copy.a11y.skip}</a>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-[#0B1F33]/10 bg-white/95 backdrop-blur-lg">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-2 px-4 sm:gap-5 sm:px-8">
          <a aria-label={copy.a11y.home} href="#inicio"><Wordmark /></a>
          <nav aria-label={copy.a11y.primaryNav} className="hidden items-center gap-7 text-sm font-bold text-[#12385F] lg:flex">
            <a className="hover:text-[#087D72]" href="#funciones">{copy.nav.features}</a>
            <a className="hover:text-[#087D72]" href="#como-funciona">{copy.nav.how}</a>
            <a className="hover:text-[#087D72]" href="#preguntas">{copy.nav.faq}</a>
          </nav>
          {quoteHref ? <a className={`${buttonBase} hoststay-primary-action min-h-10 px-3 py-2 sm:px-4`} href={quoteHref}><span className="sm:hidden">{copy.nav.quoteShort}</span><span className="hidden sm:inline">{copy.nav.quote}</span></a> : null}
        </div>
      </header>

      <main className="overflow-hidden" id="contenido">
        <section className="relative isolate bg-[#0B1F33] px-5 pb-20 pt-32 text-white sm:px-8 sm:pb-28 sm:pt-40" id="inicio">
          <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute -right-40 -top-48 size-[34rem] rounded-full bg-[#14B8A6]/20 blur-3xl" />
            <div className="absolute -bottom-64 -left-40 size-[38rem] rounded-full bg-[#12385F] blur-3xl" />
            <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:56px_56px]" />
          </div>
          <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-[1.02fr_.98fr]">
            <div>
              <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#5EEAD4]">{copy.hero.eyebrow}</p>
              <h1 className="mt-5 max-w-4xl text-4xl font-extrabold leading-[1.05] tracking-[-0.04em] sm:text-6xl xl:text-7xl">{copy.hero.title}</h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-[#DCE7F2] sm:text-xl">{copy.hero.description}</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {quoteHref ? <a className={`${buttonBase} hoststay-primary-action`} href={quoteHref}>{copy.hero.quote}<ArrowRight aria-hidden="true" className="size-4" /></a> : null}
                {env.VENDOR_DEMO_URL ? <a className={`${buttonBase} border border-white/40 bg-white/5 text-white hover:bg-white/15`} href={env.VENDOR_DEMO_URL}>{copy.hero.demo}</a> : null}
              </div>
            </div>
            <DashboardPreview />
          </div>
        </section>

        <section aria-labelledby="trust-title" className="border-b border-[#0B1F33]/10 bg-white px-5 py-10 sm:px-8">
          <div className="mx-auto grid max-w-7xl gap-7 lg:grid-cols-[1fr_2fr] lg:items-center">
            <h2 className="text-xl font-extrabold tracking-tight text-[#0B1F33]" id="trust-title">{copy.trust.title}</h2>
            <ul className="grid gap-4 text-sm font-semibold text-[#12385F] sm:grid-cols-3">
              {copy.trust.items.map((item) => <li className="flex items-start gap-2.5" key={item}><ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[#087D72]" />{item}</li>)}
            </ul>
          </div>
        </section>

        <section className="scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28" id="funciones">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl"><p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#087D72]">{copy.features.eyebrow}</p><h2 className="mt-4 text-3xl font-extrabold tracking-[-0.035em] text-[#0B1F33] sm:text-5xl">{copy.features.title}</h2><p className="mt-5 text-lg leading-8 text-[#5B6B7D]">{copy.features.description}</p></div>
            <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-6">
              {copy.features.items.map((item, index) => {
                const Icon = featureIcons[item.key];
                return <article className={`rounded-3xl border border-[#0B1F33]/10 bg-white p-7 shadow-sm ${index < 3 ? "lg:col-span-2" : "lg:col-span-3"}`} key={item.key}><span className="grid size-12 place-items-center rounded-2xl bg-[#14B8A6]/15 text-[#087D72]"><Icon aria-hidden="true" className="size-6" /></span><h3 className="mt-6 text-xl font-extrabold text-[#0B1F33]">{item.title}</h3><p className="mt-3 leading-7 text-[#5B6B7D]">{item.description}</p></article>;
              })}
            </div>
          </div>
        </section>

        <section className="bg-[#12385F] px-5 py-20 text-white sm:px-8 sm:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl"><p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#5EEAD4]">{copy.control.eyebrow}</p><h2 className="mt-4 text-3xl font-extrabold tracking-[-0.035em] sm:text-5xl">{copy.control.title}</h2><p className="mt-5 text-lg leading-8 text-[#DCE7F2]">{copy.control.description}</p></div>
            <div className="mt-12 grid gap-5 md:grid-cols-2">
              <article className="rounded-3xl border border-white/15 bg-[#0B1F33]/45 p-7 sm:p-9"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-white/10"><X aria-hidden="true" className="size-5" /></span><h3 className="text-xl font-extrabold">{copy.control.beforeTitle}</h3></div><ul className="mt-7 space-y-4 text-[#DCE7F2]">{copy.control.before.map((item) => <li className="flex gap-3" key={item}><span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-[#8BA2B8]" />{item}</li>)}</ul></article>
              <article className="rounded-3xl bg-white p-7 text-[#0B1F33] sm:p-9"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-[#14B8A6]/15 text-[#087D72]"><Check aria-hidden="true" className="size-5" /></span><h3 className="text-xl font-extrabold">{copy.control.afterTitle}</h3></div><ul className="mt-7 space-y-4 text-[#415469]">{copy.control.after.map((item) => <li className="flex gap-3" key={item}><Check aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[#087D72]" />{item}</li>)}</ul></article>
            </div>
          </div>
        </section>

        <section className="scroll-mt-20 bg-white px-5 py-20 sm:px-8 sm:py-28" id="como-funciona">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl"><p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#087D72]">{copy.how.eyebrow}</p><h2 className="mt-4 text-3xl font-extrabold tracking-[-0.035em] text-[#0B1F33] sm:text-5xl">{copy.how.title}</h2><p className="mt-5 text-lg leading-8 text-[#5B6B7D]">{copy.how.description}</p></div>
            <ol className="mt-12 grid gap-8 md:grid-cols-3">
              {copy.how.steps.map((step, index) => <li className="relative border-t-2 border-[#14B8A6] pt-8" key={step.title}><span className="text-sm font-extrabold text-[#087D72]">0{index + 1}</span><h3 className="mt-4 text-xl font-extrabold text-[#0B1F33]">{step.title}</h3><p className="mt-3 leading-7 text-[#5B6B7D]">{step.description}</p></li>)}
            </ol>
          </div>
        </section>

        {env.VENDOR_DEMO_URL ? <section className="px-5 py-16 sm:px-8 sm:py-20"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 rounded-[2rem] border border-[#0B1F33]/10 bg-[#E8F8F6] p-8 sm:p-12 lg:flex-row lg:items-center"><div className="max-w-2xl"><p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#087D72]">{copy.demo.eyebrow}</p><h2 className="mt-3 text-3xl font-extrabold tracking-tight text-[#0B1F33]">{copy.demo.title}</h2><p className="mt-4 leading-7 text-[#415469]">{copy.demo.description}</p></div><a className={`${buttonBase} bg-[#0B1F33] text-white hover:bg-[#12385F]`} href={env.VENDOR_DEMO_URL}>{copy.demo.action}<ArrowRight aria-hidden="true" className="size-4" /></a></div></section> : null}

        <section className="scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28" id="preguntas">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.75fr_1.25fr]">
            <div><p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#087D72]">{copy.faq.eyebrow}</p><h2 className="mt-4 text-3xl font-extrabold tracking-[-0.035em] text-[#0B1F33] sm:text-5xl">{copy.faq.title}</h2></div>
            <div className="divide-y divide-[#0B1F33]/10 border-y border-[#0B1F33]/10">
              {copy.faq.items.map((item) => <details className="group py-2" key={item.question}><summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 py-3 text-lg font-extrabold text-[#0B1F33]"><span>{item.question}</span><ChevronDown aria-hidden="true" className="size-5 shrink-0 text-[#087D72] transition-transform group-open:rotate-180" /></summary><p className="max-w-2xl pb-6 pr-10 leading-7 text-[#5B6B7D]">{item.answer}</p></details>)}
            </div>
          </div>
        </section>

        <section className="px-5 pb-20 sm:px-8 sm:pb-28" id="contacto">
          <div className="mx-auto overflow-hidden rounded-[2rem] bg-[#0B1F33] px-7 py-12 text-white sm:px-12 sm:py-16 lg:flex lg:items-end lg:justify-between lg:gap-16">
            <div className="max-w-2xl"><p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#5EEAD4]">{copy.contact.eyebrow}</p><h2 className="mt-4 text-3xl font-extrabold tracking-[-0.035em] sm:text-5xl">{copy.contact.title}</h2><p className="mt-5 text-lg leading-8 text-[#DCE7F2]">{copy.contact.description}</p></div>
            <div className="mt-8 flex shrink-0 flex-col gap-3 sm:flex-row lg:mt-0 lg:flex-col">
              {whatsappHref ? <a aria-label={copy.contact.whatsappAria} className={`${buttonBase} hoststay-primary-action`} href={whatsappHref}><MessageCircle aria-hidden="true" className="size-5" />{copy.contact.whatsapp}</a> : null}
              {emailHref ? <a className={`${buttonBase} border border-white/35 text-white hover:bg-white/10`} href={emailHref}><Mail aria-hidden="true" className="size-5" />{copy.contact.email}</a> : null}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#071727] px-5 py-12 text-white sm:px-8">
        <div className="mx-auto max-w-7xl"><div className="grid gap-10 border-b border-white/15 pb-10 md:grid-cols-[1fr_auto]"><div><Wordmark inverse /><p className="mt-5 max-w-lg text-sm leading-6 text-[#B9C9D9]">{copy.footer.tagline}</p><p className="mt-2 text-sm font-bold text-white">{copy.footer.closing}</p></div><nav aria-label={copy.footer.navigation} className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-bold text-[#DCE7F2]"><a href="#funciones">{copy.nav.features}</a><a href="#como-funciona">{copy.nav.how}</a><a href="#preguntas">{copy.nav.faq}</a></nav></div><p className="pt-7 text-sm text-[#B9C9D9]">© {new Date().getFullYear()} HostStay. {copy.footer.rights}</p></div>
      </footer>
    </>
  );
}
