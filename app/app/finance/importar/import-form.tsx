"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAirbnbTotal } from "@/lib/domain/airbnb-import-view";
import { airbnbImportAction, type AirbnbImportState } from "./actions";

type Unit = { id: string; name: string };
type Summary = Extract<AirbnbImportState, { mode: "preview" }>["summary"];

function MoneyTotals({ totals }: { totals: Record<string, number> }) {
  return Object.keys(totals).length === 0 ? <span>Sin movimientos</span> : (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {Object.entries(totals).map(([currency, cents]) => (
        <li key={currency}>{formatAirbnbTotal(cents, currency)}</li>
      ))}
    </ul>
  );
}

function netTotals(gross: Record<string, number>, fee: Record<string, number>) {
  return Object.fromEntries(Object.entries(gross).map(([currency, cents]) => [currency, cents - (fee[currency] ?? 0)]));
}

export function AirbnbImportForm({ units }: { units: Unit[] }) {
  const [selection, setSelection] = useState<{ file: File | null; version: number }>({ file: null, version: 0 });
  return (
    <ImportSession key={selection.version} file={selection.file} units={units}
      onFileChange={(file) => setSelection((previous) => ({ file, version: previous.version + 1 }))} />
  );
}

function ImportSession({ file, units, onFileChange }: { file: File | null; units: Unit[]; onFileChange: (file: File | null) => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fxRate, setFxRate] = useState("");
  const [state, formAction, pending] = useActionState<AirbnbImportState | null, FormData>(async (previous, data) => {
    if (file) data.set("file", file);
    data.set("mapping", JSON.stringify(Object.fromEntries(Object.entries(mapping).filter(([, unitId]) => unitId !== ""))));
    data.set("fxRate", fxRate);
    const next = await airbnbImportAction(previous, data);
    if (next.ok && next.mode === "preview") setSummary(next.summary);
    return next;
  }, null);
  const result = state?.ok && state.mode === "import" ? state.result : null;
  const allMapped = summary !== null && summary.spaces.every((space) => units.some((unit) => unit.id === mapping[space]));

  return (
    <form action={formAction} className="flex min-w-0 flex-col gap-5" aria-busy={pending}>
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-3">
        <legend className="mb-3 font-medium">1. Elige tu archivo</legend>
        <Label htmlFor="airbnb-file">Archivo CSV de Airbnb (máximo 2 MB)</Label>
        <Input id="airbnb-file" type="file" name="file" accept=".csv" aria-describedby="airbnb-file-name"
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} />
        <p id="airbnb-file-name" className="break-all text-sm text-muted-foreground">
          {file ? `Archivo seleccionado: ${file.name}` : "Ningún archivo seleccionado."}
        </p>
        <div><Button type="submit" name="mode" value="preview" formNoValidate disabled={!file}>Ver vista previa</Button></div>
      </fieldset>

      {pending && <p role="status" className="text-sm">Procesando archivo…</p>}
      {state && !state.ok && <p role="alert" className="text-sm text-destructive">{state.error}</p>}

      {summary && !result && (
        <>
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6 text-sm" role="region" aria-label="Vista previa">
              <h2 className="font-medium">2. Revisa el historial</h2>
              <p>Reservas: <strong>{summary.reservations}</strong></p>
              <div>Ingresos brutos por moneda: <MoneyTotals totals={summary.grossCents} /></div>
              <div>Se registrará como ingreso el neto (bruto menos comisión): <MoneyTotals totals={netTotals(summary.grossCents, summary.feeCents)} /></div>
              <div>Comisiones de Airbnb por moneda (no se registran como egreso; quedan en la nota): <MoneyTotals totals={summary.feeCents} /></div>
              <div>Transferencias al banco: <strong>{summary.payouts.count}</strong><MoneyTotals totals={summary.payouts.totalCents} /></div>
              <p className="text-muted-foreground">Las transferencias al banco no se cuentan como ingreso: corresponden a los pagos de las reservas.</p>
              {summary.skipped.length > 0 && (
                <details>
                  <summary className="cursor-pointer font-medium">Filas omitidas ({summary.skipped.length}; máximo 200)</summary>
                  <ul className="mt-2 max-h-64 list-inside list-disc overflow-y-auto break-words">
                    {summary.skipped.slice(0, 200).map((item, index) => <li key={index}>Línea {item.line}: {item.reason}</li>)}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>
          <fieldset disabled={pending} className="flex min-w-0 flex-col gap-4">
            <legend className="mb-3 font-medium">3. Empareja los espacios con tus casas</legend>
            {units.length === 0 && <p className="text-sm text-destructive">No hay casas disponibles. Crea una casa antes de importar.</p>}
            {summary.spaces.map((space, index) => {
              const unmapped = !mapping[space] && summary.unmappedSpaces.includes(space);
              return (
                <div key={space} className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={`airbnb-space-${index}`} className="break-words">{space || "Espacio sin nombre"}</Label>
                  <select id={`airbnb-space-${index}`} required value={mapping[space] ?? ""}
                    aria-describedby={unmapped ? `airbnb-space-${index}-hint` : undefined}
                    className={`h-11 w-full min-w-0 rounded-md border bg-background px-3 text-sm ${unmapped ? "border-destructive" : "border-input"}`}
                    onChange={(event) => setMapping((previous) => ({ ...previous, [space]: event.target.value }))}>
                    <option value="">Selecciona una casa…</option>
                    {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                  </select>
                  {unmapped && <p id={`airbnb-space-${index}-hint`} className="text-xs text-destructive">Pendiente de emparejar.</p>}
                </div>
              );
            })}
            {summary.needsFxRate && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="airbnb-fx">Tipo de cambio (S/ por 1 USD)</Label>
                <Input id="airbnb-fx" name="fxRate" required inputMode="decimal" maxLength={12} placeholder="3.75"
                  value={fxRate} onChange={(event) => setFxRate(event.target.value)} aria-describedby="airbnb-fx-hint" />
                <p id="airbnb-fx-hint" className="text-xs text-muted-foreground">Se aplicará a las reservas en USD de este archivo. Debe ser mayor que 0 y menor que 100.</p>
              </div>
            )}
            <div><Button type="submit" name="mode" value="import"
              disabled={!file || !allMapped || summary.reservations === 0 || (summary.needsFxRate && !fxRate.trim())}>Importar</Button></div>
          </fieldset>
        </>
      )}

      {result && (
        <Card>
          <CardContent className="flex flex-col gap-2 pt-6 text-sm" role="status">
            <h2 className="font-medium">Importación completada</h2>
            <p>Reservas insertadas: <strong>{result.inserted}</strong></p>
            <p>Duplicadas: <strong>{result.duplicates}</strong></p>
            <p>Omitidas porque ya estaban registradas: <strong>{result.skippedOverlap}</strong></p>
            <p>Omitidas porque aún no terminan; llegan por el calendario: <strong>{result.skippedFuture}</strong></p>
            <p>Reservas con comisión descontada (guardada en la nota): <strong>{result.commissions}</strong></p>
            <p className="text-muted-foreground">Volver a importar el mismo archivo es seguro: no se duplican las reservas.</p>
          </CardContent>
        </Card>
      )}
    </form>
  );
}
