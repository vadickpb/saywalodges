"use client";

import { useRouter } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const THEME_COOKIE = "dashboard-theme";

// Flips app/app/layout.tsx's server-read theme cookie and asks Next to
// re-render with it — no next-themes here, since that library toggles a
// class on <html> globally and dark mode in this app is dashboard-only
// (see app/globals.css's .dashboard/.dashboard.dark scoping).
export function ThemeToggle({ isDark }: { isDark: boolean }) {
  const router = useRouter();

  function toggle() {
    const next = isDark ? "light" : "dark";
    // Secure only when actually served over https — setting it on plain
    // http (local dev) makes the browser silently refuse the cookie.
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax${secure}`;
    router.refresh();
  }

  return (
    <Button variant="outline" size="icon" aria-label="Toggle theme" onClick={toggle}>
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
