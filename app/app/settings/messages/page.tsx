import { isActiveOrgOwner } from "@/lib/dal/payment-accounts";
import { getMessageLibrary } from "@/lib/dal/message-templates";
import { MessageLibraryEditor } from "@/components/dashboard/message-library-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function MessagesSettingsPage() {
  // The messages are the business's voice and hold the Wi-Fi and door code: owner only (the database enforces it too).
  if (!(await isActiveOrgOwner())) {
    return (
      <Card>
        <CardHeader><CardTitle>Mensajes para tus huéspedes</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Solo el dueño puede cambiar los mensajes. Tú puedes enviarlos desde cada reserva del calendario.</p></CardContent>
      </Card>
    );
  }
  const library = await getMessageLibrary();
  return <MessageLibraryEditor templates={library.templates} house={library.house} />;
}
