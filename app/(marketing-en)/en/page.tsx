import { MarketingLanding } from "@/components/marketing/landing";
import { marketingMetadata } from "@/components/marketing/metadata";

export const metadata = marketingMetadata("en");

export default function EnglishLandingPage() {
  return <MarketingLanding locale="en" />;
}
