import { verifySession } from "@/lib/dal/session";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

// Empty placeholder — SD-201/SD-202 fill this in with property settings and
// the content/photo manager; SD-210 adds the theme editor here too.
export default async function SitePage() {
  await verifySession();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sitio</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Próximamente.</p>
      </CardContent>
    </Card>
  );
}
