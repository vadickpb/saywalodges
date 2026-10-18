import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import {
  CalendarDays,
  ClipboardList,
  DollarSign,
  FileText,
  Globe,
  Settings,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge, type BookingStatus } from "@/components/ui/status-badge";
import { SidebarNav, type NavItem } from "@/components/ui/sidebar-nav";
import { MobileBottomNav } from "@/components/ui/mobile-bottom-nav";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { DatePickerDemo, ConfirmDialogDemo, ToastDemo } from "./interactive-demos";

const THEME_COOKIE = "dashboard-theme";

const NAV_ITEMS: NavItem[] = [
  { href: "/app/bookings", label: "Bookings", icon: ClipboardList },
  { href: "/app/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/app/quote", label: "Quote", icon: FileText },
  { href: "/app/guests", label: "Guests", icon: Users },
  { href: "/app/site", label: "Site", icon: Globe },
  { href: "/app/rates", label: "Rates", icon: DollarSign },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

type SampleBooking = { id: string; guest: string; dates: string; status: BookingStatus };

const SAMPLE_BOOKINGS: SampleBooking[] = [
  { id: "1", guest: "Maria Gonzalez", dates: "Nov 12 – 15", status: "confirmed" },
  { id: "2", guest: "John Carter", dates: "Nov 18 – 20", status: "pending" },
  { id: "3", guest: "Ana Torres", dates: "Nov 22 – 24", status: "blocked" },
];

const BOOKING_COLUMNS: DataTableColumn<SampleBooking>[] = [
  { key: "guest", header: "Guest", render: (row) => row.guest },
  { key: "dates", header: "Dates", render: (row) => row.dates },
  { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
];

// Dev-only component showcase (SD-107) — not gated by session, since this
// ticket has no dependency on SD-103's auth. Gated by environment instead.
export default async function UiShowcasePage() {
  if (process.env.NODE_ENV === "production") notFound();

  const cookieStore = await cookies();
  const isDark = cookieStore.get(THEME_COOKIE)?.value === "dark";

  return (
    <div className="flex">
      <SidebarNav items={NAV_ITEMS} activeHref="/app/bookings" />
      <main className="flex-1 space-y-10 p-6 pb-20 md:pb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Design system</h1>
          <ThemeToggle isDark={isDark} />
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Metric cards
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard label="Bookings this month" value="24" trend={{ value: "+12%", direction: "up" }} />
            <MetricCard label="Occupancy" value="68%" trend={{ value: "-4%", direction: "down" }} />
            <MetricCard label="Revenue (PEN)" value="S/ 12,480" />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Buttons</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <Button disabled>Disabled</Button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Inputs & select
          </h2>
          <Card>
            <CardContent className="grid max-w-md gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="demo-email">Email</Label>
                <Input id="demo-email" type="email" placeholder="owner@example.com" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="demo-currency">Currency</Label>
                <Select defaultValue="PEN">
                  <SelectTrigger id="demo-currency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PEN">PEN — Peruvian Sol</SelectItem>
                    <SelectItem value="USD">USD — US Dollar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Check-in date</Label>
                <DatePickerDemo />
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Badges</h2>
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <StatusBadge status="confirmed" />
            <StatusBadge status="pending" />
            <StatusBadge status="blocked" />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Table — loaded / loading / error / empty
          </h2>
          <div className="space-y-4">
            <DataTable columns={BOOKING_COLUMNS} data={SAMPLE_BOOKINGS} rowKey={(row) => row.id} />
            <DataTable columns={BOOKING_COLUMNS} data={[]} rowKey={(row) => row.id} isLoading />
            <DataTable columns={BOOKING_COLUMNS} data={[]} rowKey={(row) => row.id} error="Could not load bookings." />
            <DataTable columns={BOOKING_COLUMNS} data={[]} rowKey={(row) => row.id} emptyMessage="No bookings yet." />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Toasts & confirmation
          </h2>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Try it</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <ToastDemo />
              <ConfirmDialogDemo />
            </CardContent>
          </Card>
        </section>
      </main>
      <MobileBottomNav items={NAV_ITEMS} activeHref="/app/bookings" />
      <Toaster theme={isDark ? "dark" : "light"} />
    </div>
  );
}
