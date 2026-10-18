import { cookies } from "next/headers";
import { cn } from "cn";

const THEME_COOKIE = "dashboard-theme";

// Scopes the dashboard's own design tokens (SD-107) to this subtree via the
// .dashboard class, leaving the public tenant site's :root tokens untouched.
// The theme is read from a cookie server-side (not client-side state), so
// there's no flash of the wrong theme on load.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isDark = cookieStore.get(THEME_COOKIE)?.value === "dark";

  return <div className={cn("dashboard min-h-screen", isDark && "dark")}>{children}</div>;
}
