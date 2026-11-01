import Link from "next/link";
import { ArrowDown, ArrowRight, CalendarDays, Check, Globe2, Layers3, MessageCircle, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { marketingContent } from "@/config/marketing-content";
import { marketingDictionaries, type MarketingLocale } from "@/dictionaries/marketing";
import { marketingUrls, whatsappUrl } from "@/lib/domain/marketing";
import { env } from "@/lib/env";

const featureIcons = [Globe2, CalendarDays, Wallet, MessageCircle];
const sectionClass = "mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24";
const headingClass = "text-3xl font-semibold tracking-tight sm:text-4xl text-balance";
const labelClass = "mb-4 text-sm font-semibold text-primary";

export function MarketingLanding({ locale }: { locale: MarketingLocale }) {
  const t = marketingDictionaries[locale];
  const urls = marketingUrls(env.ROOT_DOMAIN, marketingContent.demoSubdomain, locale);
  const contact = whatsappUrl(marketingContent.whatsappNumber, marketingContent.whatsappMessage[locale]);
  const story = marketingContent.caseStudy[locale];
  const contactButton = (
    <Button asChild size="lg" className="min-h-12 h-auto whitespace-normal px-5 py-3 text-center">
      <a href={contact}><MessageCircle aria-hidden="true" />{t.cta}<ArrowRight aria-hidden="true" /></a>
    </Button>
  );

  return (
    <div lang={locale} className="marketing min-h-screen" id="top">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:p-4 focus:text-primary-foreground">{t.skip}</a>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <a href="#top" className="flex min-h-11 items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Layers3 className="size-5" aria-hidden="true" /></span>
            Saywa <span className="font-normal text-muted-foreground">Direct</span>
          </a>
          <nav aria-label={t.navigation} className="flex flex-wrap items-center gap-1 sm:gap-2">
            <Button asChild variant="ghost" className="hidden min-h-11 sm:inline-flex"><a href="#features">{t.nav.features}</a></Button>
            <Button asChild variant="ghost" className="hidden min-h-11 sm:inline-flex"><a href="#plans">{t.nav.plans}</a></Button>
            <Button asChild variant="ghost" className="hidden min-h-11 md:inline-flex"><a href="#faq">{t.nav.faq}</a></Button>
            <Button asChild variant="ghost" className="min-h-11"><Link href={locale === "es" ? "/en" : "/"} hrefLang={locale === "es" ? "en" : "es"} lang={locale === "es" ? "en" : "es"} aria-label={t.languageLabel}>{t.language}</Link></Button>
            <Button asChild variant="outline" className="min-h-11"><Link href="/login">{t.nav.login}</Link></Button>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <section className={`${sectionClass} grid items-center gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-16`} aria-labelledby="hero-title">
          <div>
            <Badge variant="secondary" className="mb-6 whitespace-normal px-3 py-1.5 leading-relaxed">{t.eyebrow}</Badge>
            <h1 id="hero-title" className="max-w-3xl text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">{t.title}</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">{t.intro}</p>
            <div className="mt-8 flex flex-col items-stretch gap-3 sm:items-start">{contactButton}<Button asChild variant="link" className="min-h-11 h-auto whitespace-normal text-center"><a href={urls.demo}>{t.demo}<ArrowRight aria-hidden="true" /></a></Button></div>
            <p className="mt-6 max-w-xl text-sm leading-relaxed text-muted-foreground">{t.availability}</p>
          </div>
          <div className="rounded-3xl bg-accent p-4 sm:p-7">
            <Card className="gap-5 border-border shadow-lg">
              <CardHeader className="border-b border-border pb-5">
                <div className="mb-4 flex items-center justify-between gap-4"><span className="text-sm font-medium text-primary">Saywa Direct</span><span aria-hidden="true" className="flex gap-1"><span className="size-2 rounded-full bg-border" /><span className="size-2 rounded-full bg-border" /><span className="size-2 rounded-full bg-primary" /></span></div>
                <p className="text-xl font-semibold tracking-tight">{t.preview.heading}</p>
                <p className="text-sm text-muted-foreground">{t.preview.label}</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">{t.preview.items.map((item) => <li key={item} className="flex items-center gap-3 rounded-lg bg-muted p-3 text-sm"><Check className="size-4 shrink-0 text-primary" aria-hidden="true" />{item}</li>)}</ul>
                <div className="mt-5 rounded-xl border border-dashed border-primary p-4"><Badge variant="secondary">{t.preview.soon}</Badge><p className="mt-3 font-medium">{t.preview.future}</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.preview.futureText}</p></div>
              </CardContent>
            </Card>
            <p className="mt-4 text-center text-xs leading-relaxed text-accent-foreground">{t.preview.caption}</p>
          </div>
        </section>
        <div className="border-y border-border bg-muted"><p className="mx-auto max-w-6xl px-5 py-4 text-sm leading-relaxed text-muted-foreground sm:px-8">{marketingContent.publicationNotice[locale]}</p></div>
        <section className={`${sectionClass} grid gap-10 md:grid-cols-2 md:gap-20`} aria-labelledby="problem-title">
          <div><p className={labelClass}>{t.problem.label}</p><h2 id="problem-title" className={headingClass}>{t.problem.title}</h2><p className="mt-6 leading-relaxed text-muted-foreground">{t.problem.text}</p></div>
          <div className="flex flex-col justify-center gap-4"><div className="rounded-xl border border-border bg-card p-5"><MessageCircle className="mb-3 size-5 text-primary" aria-hidden="true" /><p className="font-medium">{t.problem.before}</p></div><ArrowDown className="ml-5 size-5 text-primary" aria-hidden="true" /><div className="rounded-xl bg-accent p-5"><p className="font-semibold text-accent-foreground">{t.problem.after}</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.problem.detail}</p></div></div>
        </section>
        <section className="border-y border-border bg-card" aria-labelledby="steps-title"><div className={sectionClass}>
          <p className={labelClass}>{t.steps.label}</p><h2 id="steps-title" className={`${headingClass} max-w-2xl`}>{t.steps.title}</h2>
          <ol className="mt-12 grid gap-10 md:grid-cols-3">{t.steps.items.map((step, i) => <li key={step.title}><span className="mb-5 flex size-11 items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground" aria-hidden="true">0{i + 1}</span><h3 className="text-xl font-semibold tracking-tight">{step.title}</h3><p className="mt-3 leading-relaxed text-muted-foreground">{step.text}</p></li>)}</ol>
        </div></section>
        <section id="features" className={sectionClass} aria-labelledby="features-title"><p className={labelClass}>{t.features.label}</p><h2 id="features-title" className={`${headingClass} max-w-2xl`}>{t.features.title}</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2">{t.features.items.map((feature, i) => {
            const Icon = featureIcons[i];
            return <Card key={feature.title} className="gap-4"><CardHeader><div className="mb-4 flex items-center justify-between gap-3"><Icon className="size-6 text-primary" aria-hidden="true" /><Badge variant={feature.soon ? "outline" : "secondary"}>{feature.soon ? t.features.soon : t.features.live}</Badge></div><h3 className="text-xl font-semibold tracking-tight">{feature.title}</h3></CardHeader><CardContent><p className="leading-relaxed text-muted-foreground">{feature.text}</p></CardContent></Card>;
          })}</div>
        </section>
        <section aria-labelledby="case-title" className="border-y border-border bg-accent"><div className={`${sectionClass} grid gap-8 md:grid-cols-[1fr_1.5fr] md:gap-16`}><div><p className="mb-4 text-sm font-semibold text-accent-foreground">{t.caseLabel}</p><p className="text-3xl font-semibold tracking-tight">{story.name}</p></div><div><h2 id="case-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">{story.title}</h2><p className="mt-5 leading-relaxed text-muted-foreground">{story.description}</p><Button asChild variant="link" className="mt-4 min-h-11 h-auto whitespace-normal px-0"><a href={urls.demo}>{t.caseLink}<ArrowRight aria-hidden="true" /></a></Button></div></div></section>
        <section id="plans" className={sectionClass} aria-labelledby="plans-title"><p className={labelClass}>{t.plans.label}</p><h2 id="plans-title" className={headingClass}>{marketingContent.plansHeading[locale]}</h2><p className="mt-5 max-w-2xl leading-relaxed text-muted-foreground">{marketingContent.plansIntro[locale]}</p><div className="mt-10 grid gap-5 md:grid-cols-2">{marketingContent.plans[locale].map((plan) => <Card key={plan.name}><CardHeader><Badge variant="outline" className="mb-3 whitespace-normal">{marketingContent.plansBadge[locale]}</Badge><h3 className="text-xl font-semibold">{plan.name}</h3></CardHeader><CardContent><p className="text-2xl font-semibold tracking-tight">{marketingContent.pricing[locale]}</p><p className="mt-4 leading-relaxed text-muted-foreground">{plan.description}</p></CardContent></Card>)}</div></section>
        <section id="faq" className="border-y border-border bg-card" aria-labelledby="faq-title"><div className={`${sectionClass} grid gap-10 md:grid-cols-[1fr_1.5fr] md:gap-16`}><div><p className={labelClass}>{t.faq.label}</p><h2 id="faq-title" className={headingClass}>{t.faq.title}</h2></div><div className="divide-y divide-border">{t.faq.items.map((item) => <details key={item.q} className="group py-4 first:pt-0"><summary className="cursor-pointer rounded-sm py-2 pr-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{item.q}</summary><p className="mt-2 pb-2 leading-relaxed text-muted-foreground">{item.a}</p></details>)}</div></div></section>
        <section className={`${sectionClass} text-center`} aria-labelledby="closing-title"><p className={labelClass}>{t.closing.label}</p><h2 id="closing-title" className={`${headingClass} mx-auto max-w-2xl`}>{t.closing.title}</h2><p className="mx-auto mt-5 max-w-xl leading-relaxed text-muted-foreground">{t.closing.text}</p><div className="mt-8">{contactButton}</div></section>
      </main>
      <footer className="border-t border-border"><div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8"><div><p className="font-semibold">Saywa Direct</p><p className="mt-1 text-muted-foreground">{t.footer}</p></div><Button asChild variant="ghost" className="min-h-11 self-start"><a href="#top">{t.top} ↑</a></Button></div></footer>
    </div>
  );
}
