"use client";

import { usePathname } from "next/navigation";
import { BookOpenCheck, CalendarDays, FileText, Globe, Settings, Tag, Users } from "lucide-react";
import { SidebarNav, type NavItem } from "@/components/ui/sidebar-nav";
import { MobileBottomNav } from "@/components/ui/mobile-bottom-nav";

// The 7 sections from the roadmap. Each links to its own (still empty) page
// — SD-106's job is the shell and navigation, not these pages' content.
// Defined here, not in app/app/layout.tsx: a LucideIcon is a component
// reference, and Server → Client Component props must be serializable, so
// it can't be built server-side and passed in as a prop. Living inside this
// "use client" file instead, the icons are just normal client-side imports.
const NAV_ITEMS: NavItem[] = [
  { href: "/app/bookings", label: "Reservas", icon: BookOpenCheck },
  { href: "/app/calendar", label: "Calendario", icon: CalendarDays },
  { href: "/app/quotes", label: "Cotizar", icon: FileText },
  { href: "/app/guests", label: "Huéspedes", icon: Users },
  { href: "/app/site", label: "Sitio", icon: Globe },
  { href: "/app/rates", label: "Tarifas", icon: Tag },
  { href: "/app/settings", label: "Ajustes", icon: Settings },
];

// SidebarNav/MobileBottomNav (SD-107) are plain presentational components
// and don't know the current route — a server layout can't read the
// pathname either, so this thin client wrapper is the one place that calls
// usePathname() and feeds both of them the same activeHref.
export function DashboardNav() {
  const pathname = usePathname();
  // Nested routes (/app/site/spaces) keep their section highlighted.
  const activeHref = NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.href ?? pathname;
  return (
    <>
      <SidebarNav items={NAV_ITEMS} activeHref={activeHref} />
      <MobileBottomNav items={NAV_ITEMS} activeHref={activeHref} />
    </>
  );
}
