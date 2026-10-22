import { requireActiveOrg } from "@/lib/dal/organizations";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

// Dashboard landing (app.<ROOT_DOMAIN>/, which proxy.ts rewrites "/" to).
// "Signed in as X" / sign out moved into the shell's header (app/app/
// layout.tsx) — this page is just a welcome. Real KPIs arrive with the
// Phase 4 tickets (bookings/quotes), not invented ahead of real data.
export default async function AppPage() {
  // requireActiveOrg() calls verifySession() itself — same authoritative
  // check every protected page makes on its own (see lib/dal/session.ts).
  const { activeOrg } = await requireActiveOrg();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{activeOrg ? `Bienvenido a ${activeOrg.name}` : "Bienvenido a Saywa Direct"}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Usa el menú para ver tus reservas, calendario, cotizaciones, huéspedes, el sitio público y las
          tarifas.
        </p>
      </CardContent>
    </Card>
  );
}
