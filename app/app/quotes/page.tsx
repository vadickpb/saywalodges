import { verifySession } from "@/lib/dal/session";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

// Empty placeholder — SD-402 fills this in with the quote builder.
export default async function QuotesPage() {
  await verifySession();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cotizar</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Próximamente.</p>
      </CardContent>
    </Card>
  );
}
