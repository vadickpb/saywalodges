"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/app/app/site/_lib/form-state";

export type PendingRentalData = {
  blockId: string;
  unitName: string;
  channelLabel: string;
  stayStart: string; // YYYY-MM-DD
  stayEnd: string;
  stayLabel: string; // "01/03–04/03"
  currency: "PEN" | "USD";
  suggestedCleaning: string; // "80.00" or "" when the house has no suggestion
  lastFxRate: string; // prefill for dollars
};

type Props = { action: (prev: FormState, formData: FormData) => Promise<FormState>; item: PendingRentalData };

function PendingRentalItem({ action, item }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, { ok: false });
  const base = useId();
  const errors = state.errors ?? {};
  const value = (name: string, fallback: string) => state.values?.[name] ?? fallback;
  const messages = [...(errors.amount ?? []), ...(errors.fxRate ?? []), ...(errors.occurredOn ?? []), ...(errors.guests ?? []), ...(errors.cleaning ?? [])];
  const problem = state.formError ?? (messages.length > 0 ? messages.join(" ") : null);
  const title = `${item.unitName} · ${item.channelLabel} · ${item.stayLabel}`;

  return (
    <li className="rounded-md border border-border p-3">
      <form action={formAction} aria-labelledby={`${base}-title`} className="flex flex-col gap-3">
        <input type="hidden" name="blockId" value={item.blockId} />
        <input type="hidden" name="currency" value={item.currency} />
        <p id={`${base}-title`} className="font-medium text-foreground">{title}</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${base}-amount`} className="text-xs">Monto cobrado ({item.currency === "USD" ? "US$" : "S/"})</Label>
            <Input id={`${base}-amount`} name="amount" inputMode="decimal" required defaultValue={value("amount", "")} className="w-32" aria-label={`Monto cobrado de ${title}`} aria-invalid={errors.amount ? true : undefined} aria-describedby={problem ? `${base}-error` : undefined} />
          </div>
          {item.currency === "USD" && (
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${base}-fx`} className="text-xs">Tipo de cambio</Label>
              <Input id={`${base}-fx`} name="fxRate" inputMode="decimal" required defaultValue={value("fxRate", item.lastFxRate)} className="w-28" aria-label={`Tipo de cambio de ${title}`} aria-invalid={errors.fxRate ? true : undefined} aria-describedby={problem ? `${base}-error` : undefined} />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${base}-date`} className="text-xs">Fecha de cobro</Label>
            <Input id={`${base}-date`} name="occurredOn" type="date" required defaultValue={value("occurredOn", item.stayEnd)} className="w-40" aria-label={`Fecha de cobro de ${title}`} aria-invalid={errors.occurredOn ? true : undefined} aria-describedby={problem ? `${base}-error` : undefined} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${base}-guests`} className="text-xs">Huéspedes (opcional)</Label>
            <Input id={`${base}-guests`} name="guests" inputMode="numeric" defaultValue={value("guests", "")} className="w-24" aria-label={`Huéspedes de ${title}`} aria-invalid={errors.guests ? true : undefined} aria-describedby={problem ? `${base}-error` : undefined} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${base}-cleaning`} className="text-xs">Limpieza sugerida (opcional)</Label>
            <Input id={`${base}-cleaning`} name="cleaning" inputMode="decimal" defaultValue={value("cleaning", item.suggestedCleaning)} className="w-32" aria-label={`Limpieza de ${title}`} aria-invalid={errors.cleaning ? true : undefined} aria-describedby={problem ? `${base}-error` : undefined} />
          </div>
          <Button type="submit" size="sm" disabled={pending} aria-label={`Registrar ingreso de ${title}`}>{pending ? "Registrando…" : "Registrar"}</Button>
        </div>
        {problem && <p id={`${base}-error`} role="alert" className="text-sm text-destructive">{problem}</p>}
      </form>
    </li>
  );
}

export function PendingRentals({ action, items }: { action: Props["action"]; items: PendingRentalData[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <PendingRentalItem key={item.blockId} action={action} item={item} />
      ))}
    </ul>
  );
}
