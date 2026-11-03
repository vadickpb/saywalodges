"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { paymentAccountAction } from "@/app/app/settings/actions";
import type { PaymentAccount } from "@/lib/dal/payment-accounts";
import type { FormState } from "@/app/app/site/_lib/form-state";

const labels: Record<string, string> = { holder_name: "Titular", phone: "Celular", bank_name: "Banco", account_number: "Número de cuenta", cci: "CCI (opcional)", instructions: "Instrucciones (opcional)", sort_order: "Orden de aparición" };
const defaults = { kind: "yape", holder_name: "", phone: "", bank_name: "", account_number: "", cci: "", currency: "PEN", instructions: "", active: "true", sort_order: "0" };
const selectClass = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm";
const kindLabels: Record<string, string> = { yape: "Yape", plin: "Plin", bank_account: "Cuenta bancaria" };

export function PaymentAccounts({ accounts }: { accounts: PaymentAccount[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(defaults);
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, form) => {
    const result = await paymentAccountAction(prev, form);
    if (result.ok && (form.get("operation") === "save" || form.get("id") === editing)) { setEditing(null); setValues(defaults); }
    return { ...result, savedAt: Date.now() };
  }, { ok: false });
  const root = useRef<HTMLDivElement>(null);
  const alert = useRef<HTMLParagraphElement>(null);
  const base = useId();
  useEffect(() => {
    if (state.formError) {
      const invalid = root.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      (invalid ?? alert.current)?.focus();
    }
  }, [state]);
  const errors = state.errors ?? {};
  function field(name: string, maxLength?: number) {
    return <div className="space-y-1.5" key={name}>
      <Label htmlFor={`${base}-${name}`}>{labels[name]}</Label>
      <Input id={`${base}-${name}`} name={name} value={values[name]} onChange={e => setValues({ ...values, [name]: e.target.value })}
        type={name === "sort_order" ? "number" : "text"} maxLength={maxLength}
        aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `${base}-${name}-error` : undefined} />
      {errors[name] && <p id={`${base}-${name}-error`} className="text-sm text-destructive">{errors[name].join(" ")}</p>}
    </div>;
  }
  function select(name: string, label: string, options: Record<string, string>) {
    return <div className="space-y-1.5">
      <Label htmlFor={`${base}-${name}`}>{label}</Label>
      <select id={`${base}-${name}`} name={name} value={values[name]} className={selectClass}
        onChange={e => setValues({ ...values, [name]: e.target.value, ...(name === "kind" ? { phone: "", bank_name: "", account_number: "", cci: "" } : {}) })}
        aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `${base}-${name}-error` : undefined}>
        {Object.entries(options).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
      {errors[name] && <p id={`${base}-${name}-error`} className="text-sm text-destructive">{errors[name].join(" ")}</p>}
    </div>;
  }
  return <div ref={root} className="space-y-6">
    <h1 className="text-2xl font-semibold">Ajustes</h1>
    <Card><CardHeader><CardTitle>Cuentas de cobro</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">El huésped solo ve las cuentas <strong>activas</strong> cuya <strong>moneda coincide con la de su reserva</strong>.</p>
      {accounts.length === 0 && <p>Aún no tienes cuentas de cobro. Agrega una para indicar al huésped dónde pagar.</p>}
      <ul className="space-y-3">
        {accounts.map(account => <li key={account.id} className="rounded-md border p-4 space-y-2">
          <p className="font-medium">{kindLabels[account.kind]} · {account.currency} · {account.active ? "Activa" : "Inactiva"}</p>
          <p>{account.holder_name} · {account.phone ?? `${account.bank_name}: ${account.account_number}`}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={pending} onClick={() => {
              setEditing(account.id);
              setValues({ kind: account.kind, holder_name: account.holder_name, phone: account.phone ?? "", bank_name: account.bank_name ?? "", account_number: account.account_number ?? "", cci: account.cci ?? "", currency: account.currency, instructions: account.instructions ?? "", active: String(account.active), sort_order: String(account.sort_order) });
              root.current?.querySelector<HTMLElement>(`#${CSS.escape(base)}-kind`)?.focus();
            }}>Editar<span className="sr-only"> cuenta de {account.holder_name}</span></Button>
            <form action={action}>
              <input type="hidden" name="id" value={account.id} /><input type="hidden" name="operation" value="toggle" /><input type="hidden" name="active" value={String(!account.active)} />
              <Button variant="outline" disabled={pending}>{pending ? "Procesando…" : account.active ? "Desactivar" : "Activar"}<span className="sr-only"> cuenta de {account.holder_name}</span></Button>
            </form>
            <form action={action} onSubmit={e => { if (!window.confirm(`¿Eliminar la cuenta de ${account.holder_name}? Esta acción no se puede deshacer.`)) e.preventDefault(); }}>
              <input type="hidden" name="id" value={account.id} /><input type="hidden" name="operation" value="delete" />
              <Button variant="destructive" disabled={pending}>{pending ? "Procesando…" : "Eliminar"}<span className="sr-only"> cuenta de {account.holder_name}</span></Button>
            </form>
          </div>
        </li>)}
      </ul>
      <p aria-live="polite" role="status">{!pending && state.ok ? "Cambio guardado." : ""}</p>
      {state.formError && <p ref={alert} tabIndex={-1} role="alert" className="text-sm text-destructive">{state.formError}</p>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{editing ? "Editar cuenta" : "Agregar cuenta"}</CardTitle></CardHeader><CardContent>
      <form key={state.savedAt ?? 0} action={action} noValidate className="space-y-4">
        <input type="hidden" name="id" value={editing ?? ""} /><input type="hidden" name="operation" value="save" />
        <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Datos de la cuenta de cobro</legend>
          {select("kind", "Tipo de cuenta", kindLabels)}{field("holder_name", 200)}
          {values.kind === "bank_account" ? <>{field("bank_name", 100)}{field("account_number", 40)}{field("cci", 80)}</> : field("phone", 30)}
          {select("currency", "Moneda", { PEN: "Soles (PEN)", USD: "Dólares (USD)" })}
          {select("active", "Estado", { true: "Activa", false: "Inactiva" })}{field("sort_order")}{field("instructions", 500)}
        </fieldset>
        <div className="flex gap-2"><Button disabled={pending}>{pending ? "Guardando…" : editing ? "Guardar cambios" : "Agregar cuenta"}</Button>
          {editing && <Button type="button" variant="outline" disabled={pending} onClick={() => { setEditing(null); setValues(defaults); }}>Cancelar edición</Button>}
        </div>
      </form>
    </CardContent></Card>
  </div>;
}
