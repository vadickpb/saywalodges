import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type SidebarNavProps = {
  items: NavItem[];
  activeHref: string;
};

// Presentational only — no routing/active-state logic beyond the activeHref
// prop the caller passes in. SD-106 wires this into the real dashboard
// shell (org selector, actual nav items); this just renders the list.
export function SidebarNav({ items, activeHref }: SidebarNavProps) {
  return (
    <nav className="hidden md:flex md:w-56 md:flex-col md:gap-1 md:border-r md:border-border md:p-3 print:hidden">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === activeHref;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
