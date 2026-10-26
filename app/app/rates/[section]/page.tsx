import { notFound } from "next/navigation";
import { pricingSectionSchema } from "@/lib/domain/rates-management";
import { PricingList } from "../_components";
export default async function PricingSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const parsed = pricingSectionSchema.safeParse((await params).section);
  if (!parsed.success) notFound();
  return <PricingList section={parsed.data} />;
}
