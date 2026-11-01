import { MarketingDocument } from "@/components/marketing/document";

export default function EnglishMarketingLayout({ children }: { children: React.ReactNode }) {
  return <MarketingDocument locale="en">{children}</MarketingDocument>;
}
