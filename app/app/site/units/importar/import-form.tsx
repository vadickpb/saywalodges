"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPrice } from "@/lib/domain/rates-management";
import { UNIT_KIND_LABELS } from "@/lib/domain/units";
import { MAX_UNITS_CSV_BYTES, UNITS_TEMPLATE_CSV } from "@/lib/domain/units-import";
import { unitsImportAction, type UnitsImportState } from "./actions";

type Currency = "PEN" | "USD";
type Preview = Extract<UnitsImportState, { mode: "preview" }>;

export function UnitsImportForm({ currency }: { currency: Currency }) {
  const [selection, setSelection] = useState<{ file: File | null; version: number }>({ file: null, version: 0 });
  return (
    <ImportSession key={selection.version} file={selection.file} currency={currency}
      onFileChange={(file) => setSelection((previous) => ({ file, version: previous.version + 1 }))} />
  );
}

function ImportSession({ file, currency, onFileChange }: {
  file: File | null;
  currency: Currency;
  onFileChange: (file: File | null) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [state, formAction, pending] = useActionState<UnitsImportState | null, FormData>(async (previous, data) => {
    // React resets uncontrolled fields after submission. Keep the original File for both requests.
    if (file) data.set("file", file);
    const next = await unitsImportAction(previous, data);
    if (next.ok && next.mode === "preview") setPreview(next);
    else if (data.get("mode") === "preview") setPreview(null);
    return next;
  }, null);
  const result = state?.ok && state.mode === "import" ? state.result : null;

  return (
    <form action={formAction} className="flex min-w-0 flex-col gap-5" aria-busy={pending}>
      <div>
        <Button asChild variant="outline">
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(UNITS_TEMPLATE_CSV)}`} download="plantilla-casas-y-tarifas.csv">
            Descargar plantilla
          </a>
        </Button>
      </div>
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-3">
        <legend className="mb-3 font-medium">1. Elige tu archivo</legend>
        <Label htmlFor="units-file">Archivo CSV (máximo {MAX_UNITS_CSV_BYTES / 1024} KB)</Label>
        <Input id="units-file" name="file" type="file" accept=".csv" aria-describedby="units-file-name"
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} />
        <p id="units-file-name" className="break-all text-sm text-muted-foreground">
          {file ? `Archivo seleccionado: ${file.name}` : "Ningún archivo seleccionado."}
        </p>
        <div><Button type="submit" name="mode" value="preview" disabled={!file}>Ver vista previa</Button></div>
      </fieldset>

      {pending && <p role="status" className="text-sm">Procesando archivo…</p>}
      {state && !state.ok && <p role="alert" className="text-sm text-destructive">{state.error}</p>}

      {preview && !result && (
        <Card className="min-w-0">
          <CardContent className="flex min-w-0 flex-col gap-4 pt-6 text-sm" role="region" aria-label="Vista previa">
            <h2 className="font-medium">2. Revisa las casas y tarifas</h2>
            <p>{preview.rows.length} filas válidas. Todavía no se ha guardado ningún cambio.</p>
            <Table>
              <TableCaption>Tarifas base en {currency}. Si no hay precio de fin de semana, se aplica el precio por noche.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Nombre</TableHead>
                  <TableHead scope="col">Tipo</TableHead>
                  <TableHead scope="col">Huéspedes máx.</TableHead>
                  <TableHead scope="col">Huéspedes incluidos</TableHead>
                  <TableHead scope="col">Precio noche</TableHead>
                  <TableHead scope="col">Fin de semana</TableHead>
                  <TableHead scope="col">Huésped extra</TableHead>
                  <TableHead scope="col">Noches mínimas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell className="max-w-64 whitespace-normal break-words">{row.name}</TableCell>
                    <TableCell>{UNIT_KIND_LABELS[row.kind]}</TableCell>
                    <TableCell>{row.max_guests}</TableCell>
                    <TableCell>{row.included_guests}</TableCell>
                    <TableCell>{formatPrice(row.nightly_cents, currency)}</TableCell>
                    <TableCell>{row.weekend_nightly_cents === null ? "Igual que por noche" : formatPrice(row.weekend_nightly_cents, currency)}</TableCell>
                    <TableCell>{formatPrice(row.extra_guest_cents, currency)}</TableCell>
                    <TableCell>{row.min_nights}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {preview.skipped.length > 0 && (
              <div>
                <h3 className="font-medium">Filas omitidas ({preview.skipped.length})</h3>
                <ul className="mt-2 max-h-64 list-inside list-disc overflow-y-auto break-words">
                  {preview.skipped.map((item, index) => <li key={index}>Línea {item.line}: {item.reason}</li>)}
                </ul>
              </div>
            )}
            <p>Al confirmar se crearán las casas nuevas y se actualizarán las que tengan el mismo nombre, junto con sus tarifas base.</p>
            <div><Button type="submit" name="mode" value="import" disabled={pending || !file || preview.rows.length === 0}>Confirmar importación</Button></div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardContent className="flex flex-col gap-2 pt-6 text-sm" role="status">
            <h2 className="font-medium">Importación completada</h2>
            <p>{result.created} casas creadas, {result.updated} actualizadas.</p>
            <Link href="/app/site/units" className="underline">Ver casas y habitaciones</Link>
          </CardContent>
        </Card>
      )}
    </form>
  );
}
