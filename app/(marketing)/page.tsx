import { MarketingLanding } from "@/components/marketing/landing";
import { marketingMetadata } from "@/components/marketing/metadata";

export const metadata = marketingMetadata("es");

export default function LandingPage() {
  return <MarketingLanding locale="es" />;
}
