import { requireModule } from "@/lib/modules";
import { listInbox } from "@/lib/dal/whatsapp-inbox-read";
import { showStamp } from "@/lib/domain/booking-format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { markInboxReadAction } from "./actions";

export default async function WhatsappInboxPage() {
  requireModule("whatsapp");
  const messages = await listInbox();
  const unread = messages.filter((m) => !m.read).length;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">WhatsApp</h1>
        {unread > 0 && (
          <form action={markInboxReadAction}><Button type="submit" variant="outline">Marcar {unread} como leídos</Button></form>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Mensajes que los huéspedes escriben a tu número de WhatsApp Business. Responde desde la app de WhatsApp Business o con el botón. Cada persona recibe como máximo
        una respuesta automática (con el enlace para cotizar) cada 24 horas. Los mensajes se borran solos pasado el plazo de conservación.
      </p>
      {messages.length === 0 && <p>Aún no has recibido mensajes.</p>}
      <ul className="space-y-3">
        {messages.map((m) => (
          <li key={m.id}>
            <Card className={m.read ? undefined : "border-primary"}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                  <span>{m.name ?? "Sin nombre"} · +{m.fromPhone}</span>
                  <span className="text-sm font-normal text-muted-foreground">{showStamp(m.receivedAt)}{m.read ? "" : " · nuevo"}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="whitespace-pre-wrap break-words">{m.body || `[${m.type}]`}</p>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <a className="underline" href={`https://wa.me/${m.fromPhone}`} target="_blank" rel="noreferrer noopener">Responder en WhatsApp</a>
                  {m.autoReplied && <span className="text-muted-foreground">Respuesta automática enviada</span>}
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
