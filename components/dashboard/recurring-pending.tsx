"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/app/app/site/_lib/form-state";

export type PendingItemData = {
  recurringId: string;
  month: string; // first day, YYYY-MM-01
  name: string;
  dueOn: string; // YYYY-MM-DD
  dueLabel: string; // "10/03"
  monthStart: string;
  monthEnd: string; // last day of the month, for the date input
  estimated: string; // "61.20"
  estimatedLabel: string; // "S/ 50.00"
  currency: "PEN" | "USD";
  supplier: string | null;
  lastFxRate: string; // prefill for dollars
};

type Props = { action: (prev: FormState, formData: FormData) => Promise<FormState>; item: PendingItemData };

function PendingItem({ action, item }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, { ok: false });
  const base = useId();
  const errors = state.errors ?? {};
  const value = (name: string, fallback: string) => state.values?.[name] ?? fallback;
  const messages = [...(errors.amount ?? []), ...(errors.fxRate ?? []), ...(errors.occurredOn ?? []), ...(errors.month ?? [])];
  const problem = state.formError ?? (messages.length > 0 ? messages.join(" ") : null);

  return (
    <li className="rounded-md border border-border p-3">
      <form action={formAction} aria-labelledby={`${base}-title`} className="flex flex-col gap-3">
        <input type="hidden" name="recurringId" value={item.recurringId} />
        <input type="hidden" name="month" value={item.month} />
        <input type="hidden" name="currency" value={item.currency} />
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p id={`${base}-title`} className="font-medium text-foreground">{item.name}</p>
          <p className="text-sm text-muted-foreground">
            Vence el {item.dueLabel} · estimado {item.estimatedLabel}
            {item.supplier && ` · ${item.supplier}`}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${base}-amount`} className="text-xs">Monto real ({item.currency === "USD" ? "US$" : "S/"})</Label>
            <Input id={`${base}-amount`} name="amount" inputMode="decimal" required defaultValue={value("amount", item.estimated)} className="w-32" aria-label={`Monto real de ${item.name}`} aria-invalid={errors.amount ? true : undefined} aria-describedby={problem ? `${base}-error` : undefined} />
          </div>
          {item.currency === "USD" && (
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${base}-fx`} className="text-xs">Tipo de cambio</Label>
              <Input id={`${base}-fx`} name="fxRate" inputMode="decimal" required defaultValue={value("fxRate", item.lastFxRate)} className="w-28" aria-label={`Tipo de cambio de ${item.name}`} aria-invalid={errors.fxRate ? true : undefined} aria-describedby={problem ? `${base}-error` : undefined} />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${base}-date`} className="text-xs">Fecha de pago</Label>
            <Input id={`${base}-date`} name="occurredOn" type="date" required min={item.monthStart} max={item.monthEnd} defaultValue={value("occurredOn", item.dueOn)} className="w-40" aria-label={`Fecha de pago de ${item.name}`} aria-invalid={errors.occurredOn ? true : undefined} aria-describedby={problem ? `${base}-error` : undefined} />
          </div>
          <Button type="submit" size="sm" disabled={pending} aria-label={`Confirmar ${item.name}`}>{pending ? "Confirmando…" : "Confirmar"}</Button>
        </div>
        {problem && <p id={`${base}-error`} role="alert" className="text-sm text-destructive">{problem}</p>}
      </form>
    </li>
  );
}

export function PendingExpenses({ action, items }: { action: Props["action"]; items: PendingItemData[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <PendingItem key={`${item.recurringId}-${item.month}`} action={action} item={item} />
      ))}
    </ul>
  );
}
