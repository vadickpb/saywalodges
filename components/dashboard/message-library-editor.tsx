"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetTemplateAction, saveHouseInfoAction, saveTemplateAction, type MessageActionResult } from "@/app/app/settings/messages/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CUSTOM_KEYS, DEFAULT_TEMPLATES, VARIABLES, dueLabel, renderMessage, variableNames, type HouseInfo, type Template, type VariableName } from "@/lib/domain/message-templates";

// Settings → Mensajes (SD-1130), owner only: the house data the messages mention and the library of messages with tap-to-insert
// variables and a live preview. Explicit "Guardar" buttons (long texts): the autosave of the stay card is for quick data.

const SAMPLE = { name: "Ana Pérez", unit: "Villa I", checkIn: "2030-12-21", checkOut: "2030-12-24", guests: 4, requests: ["crib" as const] };
const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
const areaClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function useAction() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<MessageActionResult | null>(null);
  const router = useRouter();
  const run = (work: () => Promise<MessageActionResult>) => startTransition(async () => {
    try { const r = await work(); setResult(r); if (r.ok) router.refresh(); }
    catch { setResult({ ok: false, error: "Sin conexión. Inténtalo de nuevo." }); }
  });
  return { pending, result, run };
}
const fieldError = (r: MessageActionResult | null, name: string) => (r && !r.ok ? r.fields?.[name]?.join(" ") : undefined);
const Status = ({ r }: { r: MessageActionResult | null }) => (
  <p role="status" aria-live="polite" className={`text-sm ${r && !r.ok ? "text-destructive" : "text-muted-foreground"}`}>{r ? (r.ok ? "Guardado ✓" : r.error) : ""}</p>
);

function HouseForm({ house }: { house: HouseInfo }) {
  const [f, setF] = useState({
    checkinTime: house.checkinTime ?? "", checkoutTime: house.checkoutTime ?? "", wifiName: house.wifiName ?? "", wifiPassword: house.wifiPassword ?? "",
    doorCode: house.doorCode ?? "", locationUrl: house.locationUrl ?? "", contactPhone: house.contactPhone ?? "", rulesEs: house.rulesEs ?? "", rulesEn: house.rulesEn ?? "",
  });
  const { pending, result, run } = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((c) => ({ ...c, [k]: e.target.value }));
  const field = (k: keyof typeof f, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`house-${k}`}>{label}</Label>
      <Input id={`house-${k}`} value={f[k]} onChange={set(k)} aria-invalid={Boolean(fieldError(result, k))} aria-describedby={fieldError(result, k) ? `house-${k}-error` : undefined} {...props} />
      {fieldError(result, k) && <p id={`house-${k}-error`} className="text-sm text-destructive">{fieldError(result, k)}</p>}
    </div>
  );
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Datos de la casa</CardTitle></CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => saveHouseInfoAction(f)); }}>
          <p className="text-sm text-muted-foreground">Lo que tus mensajes mencionan. Lo dejas una vez y se completa solo. La clave del WiFi y el código de la puerta solo se envían desde 2 días antes de la llegada.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("checkinTime", "Hora de check-in", { type: "time" })}
            {field("checkoutTime", "Hora de check-out", { type: "time" })}
            {field("wifiName", "Nombre del WiFi", { maxLength: 100, autoComplete: "off" })}
            {field("wifiPassword", "Clave del WiFi", { maxLength: 100, autoComplete: "off" })}
            {field("doorCode", "Código de la puerta", { maxLength: 40, autoComplete: "off" })}
            {field("contactPhone", "Tu teléfono de contacto", { type: "tel", maxLength: 30 })}
          </div>
          {field("locationUrl", "Enlace de ubicación (https://…)", { type: "url", maxLength: 500, placeholder: "https://maps.app.goo.gl/…" })}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="house-rulesEs">Reglas de la casa (español)</Label>
              <textarea id="house-rulesEs" rows={5} maxLength={3000} className={areaClass} value={f.rulesEs} onChange={set("rulesEs")} /></div>
            <div className="space-y-1.5"><Label htmlFor="house-rulesEn">House rules (English)</Label>
              <textarea id="house-rulesEn" rows={5} maxLength={3000} className={areaClass} value={f.rulesEn} onChange={set("rulesEn")} /></div>
          </div>
          <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar datos de la casa"}</Button><Status r={result} /></div>
        </form>
      </CardContent>
    </Card>
  );
}

function TemplateForm({ template, house, isNew = false, onSaved }: { template: Template; house: HouseInfo; isNew?: boolean; onSaved?: () => void }) {
  const [f, setF] = useState({ title: template.title, bodyEs: template.bodyEs, bodyEn: template.bodyEn, anchor: template.anchor ?? "", offsetDays: template.offsetDays === null ? "" : String(template.offsetDays) });
  const [preview, setPreview] = useState<"es" | "en" | null>(null);
  const focused = useRef<"bodyEs" | "bodyEn">("bodyEs");
  const areas = { bodyEs: useRef<HTMLTextAreaElement>(null), bodyEn: useRef<HTMLTextAreaElement>(null) };
  const { pending, result, run } = useAction();
  const [confirmReset, setConfirmReset] = useState(false);
  const id = `tpl-${template.key}`;

  function insert(name: VariableName) {
    const target = focused.current;
    const el = areas[target].current;
    const token = `{${name}}`;
    const start = el?.selectionStart ?? f[target].length;
    const end = el?.selectionEnd ?? start;
    const next = f[target].slice(0, start) + token + f[target].slice(end);
    setF((c) => ({ ...c, [target]: next }));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + token.length, start + token.length); });
  }
  const rendered = preview ? renderMessage(preview === "es" ? f.bodyEs : f.bodyEn, { ...SAMPLE, lang: preview, house, today: SAMPLE.checkIn }) : null;
  const err = (k: string) => fieldError(result, k);
  const builtIn = DEFAULT_TEMPLATES.find((d) => d.key === template.key);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{template.custom || isNew ? "Mensaje propio" : template.title}</CardTitle></CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await saveTemplateAction({ key: template.key, ...f }); if (r.ok) onSaved?.(); return r; }); }}>
          <div className="space-y-1.5"><Label htmlFor={`${id}-title`}>Título</Label>
            <Input id={`${id}-title`} value={f.title} maxLength={80} onChange={(e) => setF({ ...f, title: e.target.value })} aria-invalid={Boolean(err("title"))} aria-describedby={err("title") ? `${id}-title-error` : undefined} />
            {err("title") && <p id={`${id}-title-error`} className="text-sm text-destructive">{err("title")}</p>}</div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Insertar variable">
            {variableNames.map((v) => (
              <button key={v} type="button" title={VARIABLES[v]} aria-label={`Insertar {${v}}: ${VARIABLES[v]}`} onClick={() => insert(v)} className="min-h-9 rounded-full border bg-background px-2.5 text-xs hover:bg-muted">{`{${v}}`}</button>
            ))}
          </div>
          {(["bodyEs", "bodyEn"] as const).map((k) => (
            <div key={k} className="space-y-1.5">
              <Label htmlFor={`${id}-${k}`}>{k === "bodyEs" ? "Mensaje en español" : "Message in English"}</Label>
              <textarea id={`${id}-${k}`} ref={areas[k]} rows={5} maxLength={2000} className={areaClass} value={f[k]} onFocus={() => { focused.current = k; }}
                onChange={(e) => setF({ ...f, [k]: e.target.value })} aria-invalid={Boolean(err(k))} aria-describedby={err(k) ? `${id}-${k}-error` : undefined} />
              {err(k) && <p id={`${id}-${k}-error`} className="text-sm text-destructive">{err(k)}</p>}
              <button type="button" className="text-sm underline" aria-expanded={preview === (k === "bodyEs" ? "es" : "en")} onClick={() => setPreview(preview === (k === "bodyEs" ? "es" : "en") ? null : k === "bodyEs" ? "es" : "en")}>
                {preview === (k === "bodyEs" ? "es" : "en") ? "Ocultar vista previa" : "Ver vista previa"}
              </button>
            </div>
          ))}
          {rendered && (
            <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm" aria-live="polite">
              <p className="font-medium">Vista previa (reserva de ejemplo: Ana Pérez, Villa I, 21–24 dic)</p>
              <p className="whitespace-pre-wrap break-words">{rendered.text || "—"}</p>
              {rendered.missing.length > 0 && <p className="text-xs text-muted-foreground">Líneas omitidas porque falta el dato: {rendered.missing.map((m) => `{${m}}`).join(", ")} (completa «Datos de la casa»).</p>}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor={`${id}-anchor`}>Toca enviarlo…</Label>
              <select id={`${id}-anchor`} className={selectClass} value={f.anchor} onChange={(e) => setF({ ...f, anchor: e.target.value, offsetDays: e.target.value && f.offsetDays === "" ? "0" : f.offsetDays })}>
                <option value="">Cuando tú quieras</option><option value="check_in">Respecto a la llegada</option><option value="check_out">Respecto a la salida</option>
              </select></div>
            <div className="space-y-1.5"><Label htmlFor={`${id}-offset`}>Días (negativo = antes)</Label>
              <Input id={`${id}-offset`} type="number" min={-30} max={30} value={f.offsetDays} disabled={!f.anchor} onChange={(e) => setF({ ...f, offsetDays: e.target.value })} aria-invalid={Boolean(err("offsetDays"))} />
              {err("offsetDays") && <p className="text-sm text-destructive">{err("offsetDays")}</p>}</div>
          </div>
          <p className="text-xs text-muted-foreground">{dueLabel({ anchor: f.anchor === "" ? null : (f.anchor as "check_in" | "check_out"), offsetDays: f.offsetDays === "" ? null : Number(f.offsetDays) })}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar mensaje"}</Button>
            {(builtIn || template.custom) && (
              <>
                <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirmReset(true)}>{template.custom ? "Eliminar mensaje" : "Restaurar el texto original"}</Button>
                <ConfirmDialog open={confirmReset} onOpenChange={setConfirmReset} destructive confirmLabel={template.custom ? "Eliminar mensaje" : "Restaurar texto"} cancelLabel="Cancelar"
                  title={template.custom ? "¿Eliminar este mensaje?" : "¿Volver al texto original?"}
                  description={template.custom ? "Se borra para siempre." : "Se pierden tus cambios de este mensaje, incluso los no guardados."}
                  onConfirm={() => run(async () => {
                    const r = await resetTemplateAction(template.key);
                    // Back to the built-in text, right here: the form keeps its identity, so nothing the owner is typing is lost to a refresh.
                    if (r.ok && builtIn) setF({ title: builtIn.title, bodyEs: builtIn.bodyEs, bodyEn: builtIn.bodyEn, anchor: builtIn.anchor ?? "", offsetDays: builtIn.offsetDays === null ? "" : String(builtIn.offsetDays) });
                    return r;
                  })} />
              </>
            )}
            <Status r={result} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function MessageLibraryEditor({ templates, house }: { templates: Template[]; house: HouseInfo }) {
  const free = CUSTOM_KEYS.find((key) => !templates.some((t) => t.key === key));
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Mensajes para tus huéspedes</h1>
      <p className="text-sm text-muted-foreground">
        Escribe cada mensaje una vez. En la reserva del calendario aparece ya completado con el nombre y las fechas de esa estadía, listo para enviar por WhatsApp o copiar (por ejemplo, al chat de Airbnb).
        Toca una variable para insertarla donde tengas el cursor.
      </p>
      <HouseForm house={house} />
      {templates.map((t) => <TemplateForm key={t.key} template={t} house={house} />)}
      {adding && free && <TemplateForm template={{ key: free, title: "", bodyEs: "", bodyEn: "", anchor: null, offsetDays: null, custom: true }} house={house} isNew onSaved={() => setAdding(false)} />}
      {free && !adding && <Button type="button" variant="outline" onClick={() => setAdding(true)}>+ Mensaje propio (taxis, tours, cuna…)</Button>}
    </div>
  );
}
