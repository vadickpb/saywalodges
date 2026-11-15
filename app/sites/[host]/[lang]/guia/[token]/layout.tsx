import { requireModule } from "@/lib/modules";

// SD-1103: this section only exists when the "guide" module is on for the installation.
export default function ModuleLayout({ children }: { children: React.ReactNode }) {
  requireModule("guide");
  return children;
}
