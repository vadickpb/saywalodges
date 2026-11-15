"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAirbnbTotal } from "@/lib/domain/airbnb-import-view";
import { financeCsvImportAction, type FinanceCsvImportState } from "./actions";

type Summary = Extract<FinanceCsvImportState, { mode: "preview" }>["summary"];

function downloadTemplate(template: string) {
  const url = URL.createObjectURL(new Blob([template], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "plantilla-movimientos.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function CurrencyTotals({ summary }: { summary: Summary }) {
  const currencies = (["PEN", "USD"] as const).filter(
    (currency) => summary.totals[currency].income > 0 || summary.totals[currency].expense > 0,
  );
  if (currencies.length === 0) return <p>Sin movimientos válidos.</p>;

  return (
    <ul className="flex flex-col gap-1">
      {currencies.map((currency) => (
        <li key={currency}>
          <strong>{currency}:</strong> ingresos {formatAirbnbTotal(summary.totals[currency].income, currency)} · gastos{" "}
          {formatAirbnbTotal(summary.totals[currency].expense, currency)}
        </li>
      ))}
    </ul>
  );
}

export function FinanceCsvImportForm({ template }: { template: string }) {
  const [selection, setSelection] = useState<{ file: File | null; version: number }>({ file: null, version: 0 });
  return (
    <ImportSession
      key={selection.version}
      file={selection.file}
      template={template}
      onFileChange={(file) => setSelection((previous) => ({ file, version: previous.version + 1 }))}
    />
  );
}

function ImportSession({ file, template, onFileChange }: {
  file: File | null;
  template: string;
  onFileChange: (file: File | null) => void;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [fxRate, setFxRate] = useState("");
  const [state, formAction, pending] = useActionState<FinanceCsvImportState | null, FormData>(async (previous, data) => {
    if (file) data.set("file", file);
    data.set("fxRate", fxRate);
    const next = await financeCsvImportAction(previous, data);
    if (next.ok && next.mode === "preview") setSummary(next.summary);
    return next;
  }, null);
  const result = state?.ok && state.mode === "import" ? state : null;

  return (
    <form action={formAction} className="flex min-w-0 flex-col gap-5" aria-busy={pending}>
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-3">
        <legend className="mb-3 font-medium">1. Elige tu archivo</legend>
        <div>
          <Button type="button" variant="outline" onClick={() => downloadTemplate(template)}>Descargar plantilla</Button>
        </div>
        <Label htmlFor="finance-csv-file">Archivo CSV (máximo 2 MB)</Label>
        <Input
          id="finance-csv-file"
          type="file"
          name="file"
          accept=".csv,text/csv"
          aria-describedby="finance-csv-file-name"
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        />
        <p id="finance-csv-file-name" className="break-all text-sm text-muted-foreground">
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
              <h2 className="font-medium">2. Revisa los movimientos</h2>
              <p>Filas válidas: <strong>{summary.rows}</strong></p>
              <div>
                <p className="font-medium">Totales por moneda</p>
                <CurrencyTotals summary={summary} />
              </div>
              {summary.unknownCategories.length > 0 && (
                <div>
                  <p className="font-medium">Categorías desconocidas (irán a Otros ingresos/egresos)</p>
                  <ul className="list-inside list-disc break-words">
                    {summary.unknownCategories.map((category) => <li key={category}>{category}</li>)}
                  </ul>
                </div>
              )}
              {summary.skipped.length > 0 && (
                <details>
                  <summary className="cursor-pointer font-medium">Filas omitidas ({summary.skipped.length}; máximo 200)</summary>
                  <ul className="mt-2 max-h-64 list-inside list-disc overflow-y-auto break-words">
                    {summary.skipped.map((item, index) => <li key={`${item.line}-${index}`}>Línea {item.line}: {item.reason}</li>)}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>
          <fieldset disabled={pending} className="flex min-w-0 flex-col gap-4">
            <legend className="mb-3 font-medium">3. Confirma la importación</legend>
            {summary.needsFxRate && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="finance-csv-fx">Tipo de cambio (S/ por 1 USD)</Label>
                <Input
                  id="finance-csv-fx"
                  name="fxRate"
                  required
                  inputMode="decimal"
                  maxLength={12}
                  placeholder="3.75"
                  value={fxRate}
                  onChange={(event) => setFxRate(event.target.value)}
                  aria-describedby="finance-csv-fx-hint"
                />
                <p id="finance-csv-fx-hint" className="text-xs text-muted-foreground">
                  Se aplicará a los movimientos en USD. Debe ser mayor que 0 y menor que 100.
                </p>
              </div>
            )}
            <div>
              <Button type="submit" name="mode" value="import" disabled={!file || summary.rows === 0 || (summary.needsFxRate && !fxRate.trim())}>
                Importar
              </Button>
            </div>
          </fieldset>
        </>
      )}

      {result && (
        <Card>
          <CardContent className="flex flex-col gap-2 pt-6 text-sm" role="status">
            <h2 className="font-medium">Importación completada</h2>
            <p>Insertadas: <strong>{result.result.inserted}</strong></p>
            <p>Duplicadas: <strong>{result.result.duplicates}</strong></p>
            <p>Sin categoría (asignadas a Otros): <strong>{result.result.uncategorized}</strong></p>
            <p>Omitidas: <strong>{result.skipped}</strong></p>
            <p className="text-muted-foreground">Volver a importar el mismo archivo es seguro: los movimientos no se duplican.</p>
          </CardContent>
        </Card>
      )}
    </form>
  );
}
