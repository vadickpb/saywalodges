import Link from "next/link";
import { cn } from "cn";
import type { NavItem } from "@/components/ui/sidebar-nav";

type MobileBottomNavProps = {
  items: NavItem[];
  activeHref: string;
};

// Mobile counterpart to SidebarNav — shadcn has no primitive for this, so
// it's a plain composed component following the same conventions.
export function MobileBottomNav({ items, activeHref }: MobileBottomNavProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 flex border-t border-border bg-background md:hidden print:hidden">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === activeHref;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 overflow-hidden py-2 text-xs font-medium transition-colors",
              active ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Icon className="size-5 shrink-0" />
            <span className="w-full truncate text-center">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
