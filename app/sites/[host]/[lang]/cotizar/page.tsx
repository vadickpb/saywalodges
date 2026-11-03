import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/dictionaries";
import { getSiteByHost } from "@/lib/dal/public/site";
import { getProperty, whatsappUrl } from "@/lib/dal/public/property";
import { getActiveUnits } from "@/lib/dal/public/units";
import { todayInLima } from "@/lib/domain/dates";
import { QuoteForm } from "@/components/site/quote-form";
import { buttonStyles } from "@/components/site/ui";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  return { title: (await getDictionary(lang)).publicQuote.title, robots: { index: false, follow: false } };
}

export default async function PublicQuotePage({ params }: { params: Promise<{ host: string; lang: string }> }) {
  const { host, lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = (await getDictionary(lang)).publicQuote;
  const site = await getSiteByHost(host);
  if (!site) notFound();
  const property = await getProperty(site.slug);
  const contactUrl = whatsappUrl(property, lang);
  // A failed read must never appear as an empty inventory.
  const units = await getActiveUnits(property.id).catch(() => null);
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <a href={`/${lang}`} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-site-accent">{t.back}</a>
      <p className="mt-8 text-sm uppercase tracking-wide text-site-muted">{property.name}</p>
      <h1 className="mt-3 font-site-heading text-3xl tracking-tight sm:text-4xl">{t.title}</h1>
      <p className="mt-4 leading-relaxed text-site-muted">{t.intro}</p>
      <section className="mt-8 rounded-site border border-site-line p-5 sm:p-8" aria-label={t.title}>
        {units?.length ? <QuoteForm lang={lang} t={t} units={units.map(unit => ({ id: unit.id, name: unit.name, maxGuests: unit.max_guests }))} contactUrl={contactUrl} today={todayInLima()} /> : (
          <div className="space-y-5">
            <p role="status">{units === null ? t.generic : t.empty}</p>
            {units === null && <a href={`/${lang}/cotizar`} className={buttonStyles.outline}>{t.cta}</a>}
            <a href={contactUrl} className={buttonStyles.primary}>{t.contactLink}</a>
          </div>
        )}
      </section>
    </main>
  );
}
