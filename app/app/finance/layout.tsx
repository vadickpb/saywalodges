import { requireModule } from "@/lib/modules";

// SD-1103: this section only exists when the "finance" module is on for the installation.
export default function ModuleLayout({ children }: { children: React.ReactNode }) {
  requireModule("finance");
  return children;
}
