import { disabledNavHrefs } from "@/lib/modules";
import { SiteTabs } from "@/components/dashboard/site-tabs";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <SiteTabs hiddenHrefs={disabledNavHrefs()} />
      {children}
    </div>
  );
}
