"use client";

import { useActionState, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toPenCents, positiveMoneySchema } from "@/lib/domain/finance";
import { CHANNELS, CHANNEL_LABELS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/domain/finance-forms";
import { cn } from "cn";

type FormState = {
  ok: boolean;
  errors?: Record<string, string[]>;
  formError?: string;
  values?: Record<string, string>;
};

export type FinanceFormMode = "rental" | "income" | "expense" | "edit";

type Props = {
  mode: FinanceFormMode;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  units: { id: string; name: string }[];
  categories: { id: string; name: string }[]; // already filtered to this entry's kind, not archived
  today: string;
  lastFxRate: string; // prefill for the exchange rate ("" when none yet)
  propertyCurrency: "PEN" | "USD" | null;
  cleaningByUnit: Record<string, number>; // suggested cleaning cost, cents, property currency
  initial?: Record<string, string>;
  entryId?: string;
  entryKind?: "income" | "expense";
  hasReceipt?: boolean;
  stayInfo?: string; // read-only summary when editing a rental
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

function Errors({ id, messages }: { id: string; messages: string[] | undefined }) {
  if (!messages) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {messages.join(" ")}
    </p>
  );
}

function Field({ label, htmlFor, errors, hint, children }: { label: string; htmlFor: string; errors?: string[]; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <Errors id={`${htmlFor}-error`} messages={errors} />
    </div>
  );
}

function money(cents: number, currency: string) {
  return `${currency === "USD" ? "US$" : "S/"} ${(cents / 100).toFixed(2)}`;
}

// One form for the four register screens (rental, other income, expense, edit).
// Money fields are plain text parsed on the server with the exact decimal
// parser; the PEN preview below uses the same pure functions, so it shows what
// the database will store.
export function FinanceForm(props: Props) {
  const { mode, units, categories, today, lastFxRate, propertyCurrency, cleaningByUnit, initial = {}, entryId, entryKind, hasReceipt, stayInfo } = props;
  const [state, formAction, pending] = useActionState<FormState, FormData>(props.action, { ok: false });
  const baseId = useId();
  const errors = state.errors ?? {};
  const value = (name: string, fallback = "") => state.values?.[name] ?? initial[name] ?? fallback;
  const id = (name: string) => `${baseId}-${name}`;

  const [currency, setCurrency] = useState<"PEN" | "USD">(value("currency", propertyCurrency ?? "PEN") === "USD" ? "USD" : "PEN");
  const [amount, setAmount] = useState(value("amount"));
  const [fxRate, setFxRate] = useState(value("fxRate", lastFxRate));
  const [unitId, setUnitId] = useState(value("unitId"));
  const [addCleaning, setAddCleaning] = useState(state.values?.cleaning ? state.values.cleaning !== "" : false);
  const [cleaning, setCleaning] = useState(value("cleaning"));
  const isRental = mode === "rental";
  const kind: "income" | "expense" = mode === "expense" ? "expense" : mode === "edit" ? (entryKind ?? "expense") : "income";

  const suggested = useMemo(() => {
    const cents = unitId ? cleaningByUnit[unitId] : undefined;
    // The suggestion is in the property's currency: only offer it when the
    // rental is registered in that same currency.
    return cents !== undefined && currency === propertyCurrency ? (cents / 100).toFixed(2) : "";
  }, [unitId, cleaningByUnit, currency, propertyCurrency]);

  const preview = useMemo(() => {
    const parsed = positiveMoneySchema.safeParse(amount);
    if (!parsed.success || currency === "PEN") return null;
    const result = toPenCents({ amountCents: parsed.data, currency, fxRatePen: fxRate.trim().replace(",", ".") || null });
    return result.ok ? result.cents : null;
  }, [amount, currency, fxRate]);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5" encType="multipart/form-data">
      {entryId && <input type="hidden" name="id" value={entryId} />}
      {(mode === "edit" || mode !== "rental") && <input type="hidden" name="kind" value={kind} />}
      {state.formError && (
        <p role="alert" className="text-sm text-destructive">
          {state.formError}
        </p>
      )}

      {isRental && (
        <fieldset className="flex flex-col gap-4 rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-medium text-foreground">Estadía</legend>
          <Field label="Casa" htmlFor={id("unitId")} errors={errors.unitId}>
            <select id={id("unitId")} name="unitId" required value={unitId} onChange={(e) => setUnitId(e.target.value)} className={selectClass} aria-invalid={errors.unitId ? true : undefined}>
              <option value="">Selecciona…</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Llegada" htmlFor={id("stayStart")} errors={errors.stayStart}>
              <Input id={id("stayStart")} name="stayStart" type="date" required defaultValue={value("stayStart")} aria-invalid={errors.stayStart ? true : undefined} />
            </Field>
            <Field label="Salida" htmlFor={id("stayEnd")} errors={errors.stayEnd}>
              <Input id={id("stayEnd")} name="stayEnd" type="date" required defaultValue={value("stayEnd")} aria-invalid={errors.stayEnd ? true : undefined} />
            </Field>
            <Field label="Canal" htmlFor={id("channel")} errors={errors.channel}>
              <select id={id("channel")} name="channel" required defaultValue={value("channel", "direct")} className={selectClass}>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {CHANNEL_LABELS[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Huéspedes" htmlFor={id("guests")} errors={errors.guests}>
              <Input id={id("guests")} name="guests" type="number" inputMode="numeric" min={1} max={1000} defaultValue={value("guests")} />
            </Field>
          </div>
          <Field label="Nombre del huésped (opcional)" htmlFor={id("guestName")} errors={errors.guestName}>
            <Input id={id("guestName")} name="guestName" maxLength={200} defaultValue={value("guestName")} />
          </Field>
        </fieldset>
      )}

      {mode === "edit" && stayInfo && <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{stayInfo}</p>}

      {!isRental && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-foreground">Categoría</legend>
          <div className="flex flex-wrap gap-2" aria-describedby={errors.categoryId ? id("categoryId-error") : undefined}>
            {categories.map((c) => (
              <label key={c.id} className="cursor-pointer">
                <input type="radio" name="categoryId" value={c.id} required defaultChecked={value("categoryId") === c.id} className="peer sr-only" />
                <span className="inline-flex rounded-full border border-input px-3 py-1.5 text-sm transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50">
                  {c.name}
                </span>
              </label>
            ))}
          </div>
          <Errors id={id("categoryId-error")} messages={errors.categoryId} />
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={isRental ? "Monto cobrado" : "Monto"} htmlFor={id("amount")} errors={errors.amount}>
          <Input id={id("amount")} name="amount" inputMode="decimal" required placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={errors.amount ? true : undefined} />
        </Field>
        <Field label="Moneda" htmlFor={id("currency")} errors={errors.currency}>
          <select id={id("currency")} name="currency" value={currency} onChange={(e) => setCurrency(e.target.value === "USD" ? "USD" : "PEN")} className={selectClass}>
            <option value="PEN">Soles (S/)</option>
            <option value="USD">Dólares (US$)</option>
          </select>
        </Field>
        {currency === "USD" && (
          <Field label="Tipo de cambio a soles" htmlFor={id("fxRate")} errors={errors.fxRate} hint={preview !== null ? `Equivale a ${money(preview, "PEN")}` : "Ej. 3.75"}>
            <Input id={id("fxRate")} name="fxRate" inputMode="decimal" required value={fxRate} onChange={(e) => setFxRate(e.target.value)} aria-invalid={errors.fxRate ? true : undefined} />
          </Field>
        )}
        <Field label={isRental ? "Fecha del cobro" : "Fecha"} htmlFor={id("occurredOn")} errors={errors.occurredOn}>
          <Input id={id("occurredOn")} name="occurredOn" type="date" required defaultValue={value("occurredOn", today)} aria-invalid={errors.occurredOn ? true : undefined} />
        </Field>
      </div>

      {isRental && (
        <fieldset className="flex flex-col gap-4 rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-medium text-foreground">Costos de este alquiler</legend>
          <Field label="Comisión de la plataforma (opcional)" htmlFor={id("commission")} errors={errors.commission} hint="Se registra como egreso ligado al alquiler.">
            <Input id={id("commission")} name="commission" inputMode="decimal" placeholder="0.00" defaultValue={value("commission")} />
          </Field>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={id("addCleaning")}
              name="addCleaning"
              checked={addCleaning}
              onChange={(e) => {
                setAddCleaning(e.target.checked);
                if (e.target.checked && cleaning === "") setCleaning(suggested);
              }}
              className="size-4 rounded border-input"
            />
            <Label htmlFor={id("addCleaning")}>Agregar limpieza</Label>
          </div>
          {addCleaning && (
            <Field label="Costo de limpieza" htmlFor={id("cleaning")} errors={errors.cleaning} hint={suggested ? `Sugerido para esta casa: ${suggested}` : undefined}>
              <Input id={id("cleaning")} name="cleaning" inputMode="decimal" placeholder="0.00" value={cleaning} onChange={(e) => setCleaning(e.target.value)} />
            </Field>
          )}
        </fieldset>
      )}

      {!isRental && (
        <Field label="Casa" htmlFor={id("unitId")} errors={errors.unitId}>
          <select id={id("unitId")} name="unitId" value={unitId} onChange={(e) => setUnitId(e.target.value)} className={selectClass}>
            <option value="">General (no es de una casa)</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Medio de pago" htmlFor={id("paymentMethod")} errors={errors.paymentMethod}>
          <select id={id("paymentMethod")} name="paymentMethod" defaultValue={value("paymentMethod")} className={selectClass}>
            <option value="">—</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
        {!isRental && (
          <Field label={kind === "income" ? "Pagador (opcional)" : "Proveedor (opcional)"} htmlFor={id("counterparty")} errors={errors.counterparty}>
            <Input id={id("counterparty")} name="counterparty" maxLength={200} defaultValue={value("counterparty")} />
          </Field>
        )}
      </div>

      <Field label="Nota (opcional)" htmlFor={id("note")} errors={errors.note}>
        <Textarea id={id("note")} name="note" rows={2} maxLength={1000} defaultValue={value("note")} />
      </Field>

      <Field
        label={hasReceipt ? "Reemplazar comprobante (opcional)" : "Comprobante (opcional)"}
        htmlFor={id("receipt")}
        errors={errors.receipt}
        hint="Foto, JPEG, PNG, WebP o PDF; máximo 4 MB. Se guarda en un espacio privado."
      >
        <Input id={id("receipt")} name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-invalid={errors.receipt ? true : undefined} />
      </Field>

      <Button type="submit" disabled={pending} className={cn("self-start")}>
        {pending ? "Guardando…" : mode === "edit" ? "Guardar cambios" : "Registrar"}
      </Button>
    </form>
  );
}
