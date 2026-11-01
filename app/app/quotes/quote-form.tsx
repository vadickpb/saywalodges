"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice } from "@/lib/domain/rates-management";
import { submitQuoteAction, type QuoteFormState } from "./actions";
import { CopyButton } from "./copy-button";

const SELECT_CLASS = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

export function QuoteForm({ units }: { units: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<QuoteFormState, FormData>(submitQuoteAction, {});
  const v = (name: string, fallback = "") => state.values?.[name] ?? fallback;
  const p = state.preview;
  const c = state.created;
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5"><Label htmlFor="q-unit">Unidad</Label>
        <select id="q-unit" name="unitId" defaultValue={v("unitId", units[0]?.id)} className={SELECT_CLASS}>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select></div>
      <div className="space-y-1.5"><Label htmlFor="q-guests">Huéspedes</Label><Input id="q-guests" name="guests" type="number" min={1} required defaultValue={v("guests", "1")} /></div>
      <div className="space-y-1.5"><Label htmlFor="q-in">Entrada</Label><Input id="q-in" name="checkIn" type="date" required defaultValue={v("checkIn")} /></div>
      <div className="space-y-1.5"><Label htmlFor="q-out">Salida</Label><Input id="q-out" name="checkOut" type="date" required defaultValue={v("checkOut")} /></div>
      <div className="space-y-1.5"><Label htmlFor="q-lang">Idioma del mensaje</Label>
        <select id="q-lang" name="lang" defaultValue={v("lang", "es")} className={SELECT_CLASS}>
          <option value="es">Español</option>
          <option value="en">English</option>
        </select></div>
      <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
        <Button type="submit" name="intent" value="preview" variant="outline" disabled={pending}>{pending ? "Calculando…" : "Calcular"}</Button>
        <Button type="submit" name="intent" value="create" disabled={pending}>{pending ? "Generando…" : "Generar cotización"}</Button>
      </div>
      <div aria-live="polite" className="space-y-3 text-sm sm:col-span-2">
        {state.error && <p role="alert" className="text-destructive">{state.error}</p>}
        {p && (
          <div className="space-y-1">
            <p>{p.unitName} · {p.nights} noche(s) · Total <strong>{formatPrice(p.totalCents, p.currency)}</strong>
              {p.depositCents > 0 && <> · Adelanto {formatPrice(p.depositCents, p.currency)}</>}</p>
            {p.available
              ? <p className="text-muted-foreground">Fechas libres ahora. La disponibilidad definitiva se valida al reservar.</p>
              : <p role="alert" className="text-destructive">Estas fechas no están disponibles para esta unidad: no se podrá generar el enlace.</p>}
          </div>
        )}
        {c && (
          <div className="space-y-2 rounded-md border p-3">
            <p className="font-medium">Cotización lista para {c.unitName} · vence el {c.expiresOn}</p>
            <Textarea readOnly rows={6} value={c.message} aria-label="Mensaje para WhatsApp" />
            <div className="flex flex-wrap gap-2">
              <CopyButton text={c.message} label="Copiar para WhatsApp" />
              <Button asChild variant="outline"><a href={c.whatsappUrl} target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a></Button>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
