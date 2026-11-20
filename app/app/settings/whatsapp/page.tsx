import { isActiveOrgOwner } from "@/lib/dal/payment-accounts";
import { listWhatsappRules } from "@/lib/dal/whatsapp-rules";
import { WhatsappRules } from "@/components/dashboard/whatsapp-rules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function WhatsappSettingsPage() {
  // Rules decide what the business says to its guests: owner only (the database enforces it as well).
  if (!(await isActiveOrgOwner())) {
    return (
      <Card>
        <CardHeader><CardTitle>Mensajes de WhatsApp</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Solo el dueño puede cambiar las reglas de WhatsApp.</p></CardContent>
      </Card>
    );
  }
  return <WhatsappRules rules={await listWhatsappRules()} />;
}
