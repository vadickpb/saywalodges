import { requireModule } from "@/lib/modules";
import { verifySession } from "@/lib/dal/session";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

// Empty placeholder — SD-601 fills this in with the guests CRM.
export default async function GuestsPage() {
  requireModule(\"crm\"); // SD-1103: layouts render in parallel with pages, so the page guards itself too
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
