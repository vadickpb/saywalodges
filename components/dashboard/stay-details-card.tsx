"use client";

import { useEffect, useRef, useState } from "react";
import { saveStayDetailsAction } from "@/app/app/stay/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { airbnbReservationUrl, STAY_REQUESTS, stayRequestKeys, type StayDetails, type StayKey, type StayRequest } from "@/lib/domain/stay-details";

// The stay card (SD-1129): the name is the only field that matters; everything else is optional and saves by itself
// (on leaving a field, or on one tap for chips and language), so there is no "Guardar" button to remember.

type Form = { name: string; phone: string; party: string; arrival: string; lang: "es" | "en"; requests: StayRequest[]; note: string; remindOn: string };
type Status = "idle" | "saving" | "saved" | "error";

const toForm = (s: StayDetails): Form => ({
  name: s.name ?? "", phone: s.phone ?? "", party: s.party ? String(s.party) : "", arrival: s.arrival ?? "", lang: s.lang,
  requests: s.requests, note: s.note ?? "", remindOn: s.remindOn ?? "",
});

export function StayDetailsCard({ stayKey, initial }: { stayKey: StayKey; initial: StayDetails }) {
  const [form, setForm] = useState<Form>(() => toForm(initial));
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const latest = useRef(form);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeq = useRef(0);
  const dirty = useRef(false);
  useEffect(() => { latest.current = form; }, [form]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function save() {
    if (!dirty.current) return;
    const seq = ++saveSeq.current;
    const f = latest.current;
    setStatus("saving");
    const key = stayKey.kind === "booking" ? { bookingId: stayKey.bookingId } : { feedId: stayKey.feedId, externalUid: stayKey.externalUid };
    try {
      const result = await saveStayDetailsAction(key, { name: f.name, phone: f.phone, lang: f.lang, party: f.party, arrival: f.arrival, requests: f.requests, note: f.note, remindOn: f.remindOn });
      if (seq !== saveSeq.current) return; // a newer save is in flight
      if (result.ok) { setStatus("saved"); dirty.current = false; setMessage(""); }
      else { setStatus("error"); setMessage(result.error); }
    } catch {
      if (seq === saveSeq.current) { setStatus("error"); setMessage("Sin conexión. Se reintentará al volver a editar."); }
    }
  }
  function change(patch: Partial<Form>, saveNow = false) {
    dirty.current = true;
    setForm((current) => ({ ...current, ...patch }));
    if (timer.current) clearTimeout(timer.current);
    // State updates are asynchronous: wait one tick so `latest` holds the new value before saving.
    if (saveNow) timer.current = setTimeout(() => void save(), 50);
  }
  const blur = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => void save(), 50); };
  const url = airbnbReservationUrl(initial.refCode);
  const id = stayKey.kind === "booking" ? stayKey.bookingId : stayKey.externalUid.slice(0, 12);

  return (
    <section aria-label="Datos de la estadía" className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Datos de la estadía</h3>
        <span role="status" aria-live="polite" className={`text-xs ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {status === "saving" ? "Guardando…" : status === "saved" ? "Guardado ✓" : status === "error" ? message : ""}
        </span>
      </div>
      {(url || initial.phoneLast4) && (
        <p className="text-sm text-muted-foreground">
          {url && <>Airbnb {initial.refCode} · <a className="underline" href={url} target="_blank" rel="noreferrer noopener">Abrir en Airbnb (pestaña nueva)</a></>}
          {url && initial.phoneLast4 && " · "}
          {initial.phoneLast4 && <>teléfono termina en {initial.phoneLast4}</>}
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={`stay-name-${id}`}>Nombre del huésped</Label>
        <Input id={`stay-name-${id}`} value={form.name} maxLength={200} autoComplete="off" placeholder="Ana Pérez"
          onChange={(e) => change({ name: e.target.value })} onBlur={blur} />
        <p className="text-xs text-muted-foreground">Los mensajes saludan con el primer nombre. Sin nombre dicen solo «Hola».</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`stay-phone-${id}`}>WhatsApp</Label>
          <Input id={`stay-phone-${id}`} type="tel" value={form.phone} maxLength={30} autoComplete="off" placeholder="+51 999 888 777"
            onChange={(e) => change({ phone: e.target.value })} onBlur={blur} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`stay-party-${id}`}>Huéspedes</Label>
          <Input id={`stay-party-${id}`} type="number" inputMode="numeric" min={1} max={60} value={form.party}
            onChange={(e) => change({ party: e.target.value })} onBlur={blur} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`stay-arrival-${id}`}>Hora de llegada</Label>
          <Input id={`stay-arrival-${id}`} type="time" value={form.arrival} onChange={(e) => change({ arrival: e.target.value })} onBlur={blur} />
        </div>
        <div className="space-y-1.5">
          <span id={`stay-lang-${id}`} className="text-sm font-medium">Idioma de los mensajes</span>
          <div role="group" aria-labelledby={`stay-lang-${id}`} className="flex gap-2">
            {(["es", "en"] as const).map((lang) => (
              <button key={lang} type="button" aria-pressed={form.lang === lang} onClick={() => change({ lang }, true)}
                className={`min-h-11 flex-1 rounded-md border px-3 text-sm ${form.lang === lang ? "border-foreground bg-foreground text-background" : "bg-background"}`}>
                {lang === "es" ? "Español" : "English"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <span id={`stay-req-${id}`} className="text-sm font-medium">Pedidos especiales</span>
        <div role="group" aria-labelledby={`stay-req-${id}`} className="flex flex-wrap gap-2">
          {stayRequestKeys.map((key) => {
            const on = form.requests.includes(key);
            return (
              <button key={key} type="button" aria-pressed={on} onClick={() => change({ requests: on ? form.requests.filter((r) => r !== key) : [...form.requests, key] }, true)}
                className={`min-h-11 rounded-full border px-3 text-sm ${on ? "border-foreground bg-foreground text-background" : "bg-background"}`}>
                {STAY_REQUESTS[key]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`stay-note-${id}`}>Nota</Label>
        <textarea id={`stay-note-${id}`} value={form.note} maxLength={500} rows={2} placeholder="Llegan de Cusco en taxi"
          onChange={(e) => change({ note: e.target.value })} onBlur={blur}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`stay-remind-${id}`}>Recordarme el</Label>
        <Input id={`stay-remind-${id}`} type="date" value={form.remindOn} onChange={(e) => change({ remindOn: e.target.value }, true)} />
        <p className="text-xs text-muted-foreground">Ese día aparece en «Recordatorios» del calendario, con el nombre, los pedidos y la nota.</p>
      </div>
    </section>
  );
}
