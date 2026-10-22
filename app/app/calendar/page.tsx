import { verifySession } from "@/lib/dal/session";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

// Empty placeholder — SD-303 fills this in with the real unit calendar.
export default async function CalendarPage() {
  await verifySession();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calendario</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Próximamente.</p>
      </CardContent>
    </Card>
  );
}
