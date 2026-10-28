import Link from "next/link";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

// Empty placeholder — SD-303 fills this in with the real unit calendar.
export default async function CalendarPage() {
  const { activeOrg } = await requireActiveOrg();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calendario</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Próximamente.</p>
        {activeOrg?.role === "owner" && (
          <p className="mt-3 text-sm">
            <Link href="/app/calendar/feeds" className="font-medium text-foreground underline">Calendarios para Airbnb y Booking</Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
