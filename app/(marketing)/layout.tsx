import { MarketingDocument } from "@/components/marketing/document";

export default function SpanishMarketingLayout({ children }: { children: React.ReactNode }) {
  return <MarketingDocument locale="es">{children}</MarketingDocument>;
}
