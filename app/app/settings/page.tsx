import { isActiveOrgOwner, listPaymentAccounts } from "@/lib/dal/payment-accounts";
import { PaymentAccounts } from "@/components/dashboard/payment-accounts";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  // Payment accounts decide where customers send their money: owner only (the database enforces it as well).
  if (!(await isActiveOrgOwner())) {
    return (
      <Card>
        <CardHeader><CardTitle>Ajustes</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Solo el dueño puede gestionar las cuentas de cobro. Pídele que lo haga o que cambie tu rol.</p>
        </CardContent>
      </Card>
    );
  }
  const accounts = await listPaymentAccounts();
  return (
    <div className="space-y-6">
      <PaymentAccounts accounts={accounts} />
      <p className="text-sm"><Link className="underline" href="/app/settings/whatsapp">Reglas de los mensajes de WhatsApp</Link></p>
    </div>
  );
}
