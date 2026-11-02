import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getDictionary, hasLocale } from "@/dictionaries";
import { getQuoteCheckout } from "@/lib/dal/public/quote-checkout";
import { getSiteByHost } from "@/lib/dal/public/site";
import { getProperty, whatsappUrl } from "@/lib/dal/public/property";
import { CheckoutForm } from "@/components/site/checkout-form";
import { Button } from "@/components/ui/button";
import { format } from "@/lib/domain/format";

export async function generateMetadata({ params }: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  return {
    title: (await getDictionary(lang)).checkout.title,
    robots: { index: false, follow: false }, referrer: "no-referrer",
  };
}

export default async function QuoteCheckoutPage({ params }: {
  params: Promise<{ host: string; lang: string; token: string }>;
}) {
  const { host, lang, token } = await params;
  if (!hasLocale(lang)) notFound();
  const t = (await getDictionary(lang)).checkout;
  const site = await getSiteByHost(host);
  if (!site) notFound();
  const property = await getProperty(site.slug);
  const contact = <Button asChild variant="outline" size="lg"><a href={whatsappUrl(property, lang)} referrerPolicy="no-referrer" rel="noreferrer">{t.contact}</a></Button>;
  let quote;
  try { quote = await getQuoteCheckout(host, token); } catch {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-start gap-6 px-6 py-16">
        <p>{property.name}</p><h1 className="text-3xl font-semibold">{t.generic}</h1>
        <Button asChild size="lg"><a href={`/${lang}/reservar/${encodeURIComponent(token)}`}>{t.retry}</a></Button>
      </main>
    );
  }
  if (quote && "public_token" in quote) redirect(`/${lang}/reserva/${quote.public_token}`);
  if (!quote) return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-start gap-6 px-6 py-16">
      <p>{property.name}</p><h1 className="text-3xl font-semibold">{t.unusable}</h1><p>{t.unusableBody}</p>{contact}
    </main>
  );
  const money = (cents: number) => new Intl.NumberFormat(lang === "es" ? "es-PE" : "en-US", { style: "currency", currency: quote.currency }).format(cents / 100);
  const date = (day: string) => new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
  const expiry = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" }).format(new Date(quote.expires_at));
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-6 py-12">
      <p className="text-sm uppercase tracking-wide">{quote.property_name}</p>
      <h1 className="text-3xl font-semibold">{t.title}</h1>
      <section className="rounded-2xl border p-6" aria-label={quote.unit_name}>
        <h2 className="text-xl font-semibold">{quote.unit_name}</h2>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3">
          <dt>{t.stay}</dt><dd>{date(quote.check_in)} – {date(quote.check_out)}</dd>
          <dt>{t.guests}</dt><dd>{quote.guests}</dd>
          <dt>{t.total}</dt><dd>{money(quote.total_cents)}</dd>
          <dt>{t.deposit}</dt><dd>{money(quote.deposit_cents)}</dd>
          <dt>{t.balance}</dt><dd>{money(quote.balance_cents)}</dd>
        </dl>
        <p className="mt-4 text-sm">{t.expires}: {expiry} {t.timeZone}</p>
        <p className="mt-2 text-sm">{format(t.hold, { minutes: quote.hold_minutes })}</p>
      </section>
      <section className="space-y-3 text-sm" aria-labelledby="policies">
        <h2 id="policies" className="text-lg font-semibold">{t.policies}</h2>
        <p>{t.policyContent.cancellation}</p><p>{t.policyContent.terms}</p>
      </section>
      <CheckoutForm token={token} lang={lang} t={t} contactUrl={whatsappUrl(property, lang)} />
      {contact}
    </main>
  );
}
