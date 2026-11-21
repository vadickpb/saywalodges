"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/app/app/quotes/copy-button";
import { dueLabel, dueState, renderMessage, whatsappLink, type HouseInfo, type Template } from "@/lib/domain/message-templates";
import { firstName, type StayRequest } from "@/lib/domain/stay-details";

// The messages of one stay (SD-1130): every library message already filled with this guest's data, one tap to open WhatsApp with the
// text ready or to copy it (Airbnb: paste it in its chat). It follows what is typed in the stay card, so a name entered a second
// ago is already in the greeting. Nothing is sent from here; the owner presses Enviar in WhatsApp.

export type MessagesData = {
  templates: Template[]; house: HouseInfo; unit: string; checkIn: string; checkOut: string; today: string;
  /** The Wi-Fi password / door code exist but were not sent (the stay is outside its window). */
  secretsConfigured?: { wifi_clave: boolean; codigo_puerta: boolean };
};
export type StayLive = { name: string | null; phone: string | null; lang: "es" | "en"; guests: number | null; requests: StayRequest[] };

export function StayMessages({ data, live }: { data: MessagesData; live: StayLive }) {
  const [open, setOpen] = useState<string | null>(null);
  const due = data.templates.map((t) => ({ t, due: dueState(t, data, data.today), r: renderMessage(live.lang === "es" ? t.bodyEs : t.bodyEn, { ...data, ...live }) }));
  // What is due today first, then the rest in library order.
  due.sort((a, b) => Number(b.due?.state === "today") - Number(a.due?.state === "today"));
  return (
    <section aria-label="Mensajes para este huésped" className="space-y-2 rounded-lg border p-3">
      <h3 className="font-semibold">Mensajes</h3>
      <p className="text-xs text-muted-foreground">Ya vienen con {firstName(live.name) ? `el nombre de ${firstName(live.name)} y ` : ""}las fechas de esta estadía. Idioma: {live.lang === "es" ? "español" : "English"}.</p>
      <ul className="space-y-2">
        {due.map(({ t, due: d, r }) => {
          const link = whatsappLink(live.phone, r.text);
          const expanded = open === t.key;
          return (
            <li key={t.key} className="space-y-2 rounded-md border p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : t.key)} className="min-h-9 text-left text-sm font-medium underline-offset-2 hover:underline">
                  {t.title}
                </button>
                {d && (
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${d.state === "today" ? "border-foreground bg-foreground text-background" : "text-muted-foreground"}`}>
                    {d.state === "today" ? "Toca hoy" : d.state === "past" ? "Ya pasó" : dueLabel(t)}
                  </span>
                )}
              </div>
              {expanded && (
                <>
                  <p className="whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-sm">{r.text || "—"}</p>
                  {r.missing.length > 0 && <p className="text-xs text-muted-foreground">Se omitieron líneas porque falta: {r.missing.map((m) => `{${m}}`).join(", ")}.</p>}
                  {r.withheld.length > 0 && <p className="text-xs text-muted-foreground">La clave del WiFi / código de la puerta se completan desde 2 días antes de la llegada.</p>}
                </>
              )}
              <div className="flex flex-wrap gap-2">
                {link
                  ? <Button asChild size="sm" className="min-h-9"><a href={link} target="_blank" rel="noreferrer noopener">Enviar por WhatsApp (pestaña nueva)</a></Button>
                  : <Button size="sm" className="min-h-9" disabled title="Falta el WhatsApp del huésped">Enviar por WhatsApp</Button>}
                <CopyButton text={r.text} label="Copiar" size="sm" ariaLabel={`Copiar mensaje: ${t.title}`} />
              </div>
              {!link && <p className="text-xs text-muted-foreground">Sin WhatsApp del huésped (reserva de Airbnb): usa «Copiar» y pégalo en el chat de Airbnb.</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
