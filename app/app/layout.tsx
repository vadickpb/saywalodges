import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { cookies } from "next/headers";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { cn } from "cn";
import { ExternalLink, LogOut } from "lucide-react";
import { SITE_URL } from "@/config/site";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { requireActiveOrg, getOrgProperty } from "@/lib/dal/organizations";
import { getSiteUrl } from "@/lib/dal/public/site";
import { signOut } from "@/app/app/actions";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";
import { Button } from "@/components/ui/button";
import "@/app/globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const THEME_COOKIE = "dashboard-theme";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2D4A3E",
};

// Scopes the dashboard's own design tokens (SD-107) to this subtree via the
// .dashboard class, leaving the public tenant site's :root tokens untouched.
// The color theme is read from a cookie server-side (not client-side state),
// so there's no flash of the wrong theme on load.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isDark = cookieStore.get(THEME_COOKIE)?.value === "dark";

  // The real, authoritative check for each protected page stays on the page
  // itself (lib/dal/session.ts — layouts don't re-run on client-side
  // navigation between sibling routes). This call is only to build the
  // chrome below; it still redirects to /login on its own if the session
  // is missing, same as every page already does.
  //
  // requireActiveOrg throws on a real DB failure (unlike most of lib/dal/*)
  // specifically so that case can't be confused with "this user has 0
  // orgs" below — they need different copy. unstable_rethrow lets Next's
  // own redirect()/notFound() signals (e.g. the one verifySession() just
  // threw) pass through instead of being swallowed as "a real error".
  let activeOrgResult: Awaited<ReturnType<typeof requireActiveOrg>> | null = null;
  let loadFailed = false;
  try {
    activeOrgResult = await requireActiveOrg();
  } catch (error) {
    unstable_rethrow(error);
    console.error("DashboardLayout: requireActiveOrg failed:", error);
    loadFailed = true;
  }

  if (loadFailed || !activeOrgResult?.activeOrg) {
    return (
      <html lang="es" className={`${geist.variable} h-full antialiased`}>
        <body className={cn("dashboard flex min-h-screen items-center justify-center p-6", isDark && "dark")}>
          <div className="max-w-sm text-center">
            {loadFailed ? (
              <>
                <p className="text-lg font-medium text-foreground">No pudimos cargar tu organización</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Hubo un problema de nuestro lado. <Link href="/app" className="underline">Intenta de nuevo</Link>.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-medium text-foreground">Todavía no perteneces a ninguna organización</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Pídele a quien administra tu alojamiento en Saywa Direct que te invite, o escríbenos si crees
                  que esto es un error.
                </p>
              </>
            )}
            <form action={signOut} className="mt-6">
              <Button type="submit" variant="outline">
                Cerrar sesión
              </Button>
            </form>
          </div>
        </body>
      </html>
    );
  }

  const { orgs, activeOrg } = activeOrgResult;

  const supabase = await createClient();
  const property = await getOrgProperty(supabase, activeOrg.id);
  const siteUrl = property
    ? getSiteUrl(property.customDomain ?? `${property.subdomain}.${env.ROOT_DOMAIN}`)
    : null;

  return (
    <html lang="es" className={`${geist.variable} h-full antialiased`}>
      <body className={cn("dashboard min-h-screen", isDark && "dark")}>
        <div className="flex min-h-screen flex-col md:flex-row">
          <DashboardNav />

          <div className="flex min-h-screen flex-1 flex-col pb-16 md:pb-0">
            <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-6">
              {orgs.length > 1 ? (
                <OrgSwitcher orgs={orgs} activeOrgId={activeOrg.id} />
              ) : (
                <p className="truncate text-sm font-medium text-foreground">{activeOrg.name}</p>
              )}
              <div className="flex items-center gap-1.5">
                {siteUrl && (
                  <Button asChild variant="ghost" size="sm">
                    <Link href={siteUrl} target="_blank" rel="noopener noreferrer">
                      Ver mi sitio
                      <span className="sr-only"> (se abre en una pestaña nueva)</span>
                      <ExternalLink className="size-4" />
                    </Link>
                  </Button>
                )}
                <form action={signOut}>
                  <Button type="submit" variant="ghost" size="icon-sm" aria-label="Cerrar sesión">
                    <LogOut className="size-4" />
                  </Button>
                </form>
              </div>
            </header>

            <main className="flex-1 p-4 md:p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
