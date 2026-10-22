import { verifySession } from "@/lib/dal/session";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

// Empty placeholder — SD-601 fills this in with the guests CRM.
export default async function GuestsPage() {
  await verifySession();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Huéspedes</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Próximamente.</p>
      </CardContent>
    </Card>
  );
}
