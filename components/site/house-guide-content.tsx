/* eslint-disable @next/next/no-img-element -- Private images use authenticated routes, bypassing the public optimizer. */
import type { HouseGuide } from "@/lib/domain/house-guide";
import styles from "@/app/sites/[host]/[lang]/guia/[token]/guide-print.module.css";

export function HouseGuideContent({ guide, imageBase }: { guide: HouseGuide; imageBase: string }) {
  return <div className="space-y-12">{guide.sections.filter(section => section.visible).map((section, index) =>
    <section key={section.id} id={`section-${index}`} className="scroll-mt-6 space-y-4 border-t border-current/15 pt-6">
      <h2 className="font-site-heading text-2xl">{section.title}</h2>
      <p className="whitespace-pre-wrap leading-relaxed">{section.text}</p>
      {section.steps.length > 0 && <ol className="list-decimal space-y-3 pl-6">{section.steps.map((step, i) => <li key={i} className="whitespace-pre-wrap pl-1 leading-relaxed">{step}</li>)}</ol>}
      <div className={`${styles.images} grid gap-5 sm:grid-cols-2`}>{section.images.map(image =>
        <figure key={image.id} className="space-y-2">
          <img src={`${imageBase}/${image.id}`} alt={image.alt} loading="eager" className="h-auto w-full rounded-xl" />
          <figcaption className="text-sm opacity-80">{image.caption || image.alt}</figcaption>
        </figure>)}</div>
    </section>)}</div>;
}
