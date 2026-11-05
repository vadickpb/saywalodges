import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOwnerPublishedGuide } from "@/lib/dal/guest-guide";
import { HouseGuideContent } from "@/components/site/house-guide-content";
import { PrintButton } from "@/app/sites/[host]/[lang]/guia/[token]/print-button";
import styles from "@/app/sites/[host]/[lang]/guia/[token]/guide-print.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const data = await getOwnerPublishedGuide();
  return {
    title: { absolute: data ? `Guía – ${data.propertyName}` : "Guía privada" },
    robots: { index: false, follow: false, noarchive: true },
  };
}

export default async function OwnerGuidePrintPage() {
  const data = await getOwnerPublishedGuide();
  if (!data) notFound();
  return <article className={`${styles.guide} mx-auto w-full max-w-3xl px-5 py-12`}>
    <div className="mb-10 space-y-3">
      <p className="font-semibold">{data.propertyName}</p>
      <h1 className="text-3xl font-semibold">{data.guide.title}</h1>
      <PrintButton label="Descargar PDF" autoPrint />
    </div>
    <HouseGuideContent guide={data.guide} imageBase="/app/site/guide/images" />
  </article>;
}
