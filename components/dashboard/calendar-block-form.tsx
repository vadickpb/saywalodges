"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createManualBlockAction } from "@/app/app/calendar/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { FormState } from "@/app/app/site/_lib/form-state";

export function CalendarBlockForm({ units, unitId, start, end }: {
  units: { id: string; name: string; active: boolean }[]; unitId?: string; start: string; end: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createManualBlockAction, { ok: false });
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  useEffect(() => { if (state.savedAt) form.current?.reset(); }, [state.savedAt]);
  const value = (name: string, fallback: string) => state.values?.[name] ?? fallback;
  const errors = state.errors ?? {};
  return (
    <form ref={form} action={action} className="space-y-4" onSubmit={(event) => {
      if (confirmed.current) { confirmed.current = false; return; }
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const unit = units.find((u) => u.id === data.get("unitId"));
      setConfirmation(`${unit?.name ?? "Unidad"}: del ${data.get("start")} al ${data.get("end")} (salida libre). ${data.get("note") || "Sin nota."}`);
    }}>
      {state.formError && <p role="alert" className="text-sm text-destructive">{state.formError}</p>}
      {state.ok && <p role="status" className="text-sm">Bloqueo creado.</p>}
      <div className="space-y-2">
        <Label htmlFor="block-unit">Unidad</Label>
        <select id="block-unit" name="unitId" defaultValue={value("unitId", unitId ?? units[0]?.id ?? "")} required className="h-11 w-full rounded-md border bg-background px-3">
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.active ? "" : " (inactiva)"}</option>)}
        </select>
        {errors.unitId && <p role="alert">{errors.unitId.join(" ")}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {([{ name: "start", label: "Inicio (ocupado)", initial: start }, { name: "end", label: "Salida (libre)", initial: end }]).map((field) => (
          <div key={field.name} className="min-w-0 space-y-2">
            <Label htmlFor={`block-${field.name}`}>{field.label}</Label>
            <Input id={`block-${field.name}`} name={field.name} type="date" required defaultValue={value(field.name, field.initial)} aria-invalid={!!errors[field.name]} aria-describedby={errors[field.name] ? `block-${field.name}-error` : undefined} />
            {errors[field.name] && <p id={`block-${field.name}-error`} role="alert" className="text-sm text-destructive">{errors[field.name].join(" ")}</p>}
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Label htmlFor="block-note">Nota (opcional)</Label>
        <Textarea id="block-note" name="note" maxLength={500} defaultValue={value("note", "")} aria-invalid={!!errors.note} />
        {errors.note && <p role="alert" className="text-sm text-destructive">{errors.note.join(" ")}</p>}
      </div>
      <p className="text-sm text-muted-foreground">Hasta 366 noches. La salida queda libre para otro ingreso.</p>
      <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Crear bloqueo manual"}</Button>
      <ConfirmDialog open={confirmation !== null} onOpenChange={(open) => { if (!open) setConfirmation(null); }} title="¿Crear bloqueo manual?" description={confirmation ?? ""} confirmLabel="Crear bloqueo" cancelLabel="Cancelar" onConfirm={() => { confirmed.current = true; form.current?.requestSubmit(); }} />
    </form>
  );
}
