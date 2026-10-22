import { verifySession } from "@/lib/dal/session";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

// Empty placeholder — no ticket owns this yet (account/org settings).
export default async function SettingsPage() {
  await verifySession();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ajustes</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Próximamente.</p>
      </CardContent>
    </Card>
  );
}
