"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const TABS = [
  { href: "/app/site", label: "Ajustes" },
  { href: "/app/site/appearance", label: "Apariencia" },
  { href: "/app/site/units", label: "Unidades" },
  { href: "/app/site/spaces", label: "Espacios" },
  { href: "/app/site/amenities", label: "Comodidades" },
  { href: "/app/site/distances", label: "Distancias" },
  { href: "/app/site/photos", label: "Fotos" },
];

export function SiteTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones del sitio" className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((tab) => {
        const active = tab.href === "/app/site" ? pathname === tab.href : (pathname === tab.href || pathname.startsWith(`${tab.href}/`));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
              active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
