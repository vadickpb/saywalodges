import { verifySession } from "@/lib/dal/session";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

// Empty placeholder — SD-207 fills this in with rates/seasons management.
export default async function RatesPage() {
  await verifySession();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tarifas</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Próximamente.</p>
      </CardContent>
    </Card>
  );
}
