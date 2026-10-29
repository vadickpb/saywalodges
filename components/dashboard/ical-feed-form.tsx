"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ICAL_CHANNELS, ICAL_CHANNEL_LABELS } from "@/lib/domain/ical-feeds";
import type { FormState } from "@/app/app/site/_lib/form-state";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

type Props = { action: (prev: FormState, formData: FormData) => Promise<FormState>; units: { id: string; name: string }[] };

export function IcalFeedForm({ action, units }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, { ok: false });
  const base = useId();
  const errors = state.errors ?? {};
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${base}-unit`}>Casa</Label>
        <select id={`${base}-unit`} name="unitId" required defaultValue={state.values?.unitId ?? ""} className={selectClass} aria-invalid={errors.unitId ? true : undefined}>
          <option value="" disabled>Selecciona…</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${base}-channel`}>Canal</Label>
        <select id={`${base}-channel`} name="channel" required defaultValue={state.values?.channel ?? ""} className={selectClass} aria-invalid={errors.channel ? true : undefined}>
          <option value="" disabled>Selecciona…</option>
          {ICAL_CHANNELS.map((c) => <option key={c} value={c}>{ICAL_CHANNEL_LABELS[c]}</option>)}
        </select>
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Creando…" : "Crear enlace"}</Button>
      {(state.formError || errors.unitId || errors.channel) && (
        <p role="alert" className="basis-full text-sm text-destructive">{state.formError ?? [...(errors.unitId ?? []), ...(errors.channel ?? [])].join(" ")}</p>
      )}
    </form>
  );
}
