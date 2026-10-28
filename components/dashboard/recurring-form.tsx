"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/domain/finance-forms";
import type { FormState } from "@/app/app/site/_lib/form-state";

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  categories: { id: string; name: string }[]; // expense categories, not archived
  units: { id: string; name: string }[];
  initial?: Record<string, string>;
  templateId?: string;
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

function FieldError({ id, messages }: { id: string; messages: string[] | undefined }) {
  if (!messages) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {messages.join(" ")}
    </p>
  );
}

export function RecurringForm({ action, categories, units, initial = {}, templateId }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, { ok: false });
  const base = useId();
  const errors = state.errors ?? {};
  const value = (name: string, fallback = "") => state.values?.[name] ?? initial[name] ?? fallback;
  const id = (name: string) => `${base}-${name}`;
  const describe = (name: string) => (errors[name] ? `${id(name)}-error` : undefined);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      {templateId && <input type="hidden" name="id" value={templateId} />}
      {state.formError && (
        <p role="alert" className="text-sm text-destructive">
          {state.formError}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("name")}>Nombre</Label>
        <Input id={id("name")} name="name" required maxLength={120} defaultValue={value("name")} placeholder="Agua, Luz, Internet…" aria-describedby={describe("name")} aria-invalid={errors.name ? true : undefined} />
        <FieldError id={`${id("name")}-error`} messages={errors.name} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("categoryId")}>Categoría</Label>
          <select id={id("categoryId")} name="categoryId" required defaultValue={value("categoryId")} className={selectClass} aria-describedby={describe("categoryId")}>
            <option value="" disabled>Selecciona…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <FieldError id={`${id("categoryId")}-error`} messages={errors.categoryId} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("unitId")}>Casa</Label>
          <select id={id("unitId")} name="unitId" defaultValue={value("unitId")} className={selectClass}>
            <option value="">General (sin casa)</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("dayOfMonth")}>Día del mes</Label>
          <Input id={id("dayOfMonth")} name="dayOfMonth" type="number" inputMode="numeric" min={1} max={28} required defaultValue={value("dayOfMonth", "1")} aria-describedby={`${id("dayOfMonth")}-hint ${describe("dayOfMonth") ?? ""}`.trim()} aria-invalid={errors.dayOfMonth ? true : undefined} />
          <p id={`${id("dayOfMonth")}-hint`} className="text-xs text-muted-foreground">Entre 1 y 28.</p>
          <FieldError id={`${id("dayOfMonth")}-error`} messages={errors.dayOfMonth} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("amount")}>Monto estimado</Label>
          <Input id={id("amount")} name="amount" inputMode="decimal" required defaultValue={value("amount")} placeholder="50.00" aria-describedby={describe("amount")} aria-invalid={errors.amount ? true : undefined} />
          <FieldError id={`${id("amount")}-error`} messages={errors.amount} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("currency")}>Moneda</Label>
          <select id={id("currency")} name="currency" defaultValue={value("currency", "PEN")} className={selectClass}>
            <option value="PEN">Soles (S/)</option>
            <option value="USD">Dólares (US$)</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("counterparty")}>Proveedor (opcional)</Label>
          <Input id={id("counterparty")} name="counterparty" maxLength={200} defaultValue={value("counterparty")} placeholder="Sedapal" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("paymentMethod")}>Medio de pago (opcional)</Label>
          <select id={id("paymentMethod")} name="paymentMethod" defaultValue={value("paymentMethod")} className={selectClass}>
            <option value="">Sin indicar</option>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
          </select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Cada mes aparecerá como pendiente en Finanzas; lo confirmas con el monto real y se registra como un egreso.
      </p>
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Guardando…" : templateId ? "Guardar cambios" : "Crear gasto recurrente"}</Button>
      </div>
    </form>
  );
}
