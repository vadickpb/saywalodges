import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/dashboard/print-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listCategories } from "@/lib/dal/finance";
import { loadReportData } from "@/lib/dal/finance-reports";
import { getOrgProperty } from "@/lib/dal/organizations";
import { getLogoUrl } from "@/lib/dal/photos";
import { formatBps, parseReportParams, reportQuery } from "@/lib/domain/finance-report-view";
import { periodReport, type Period } from "@/lib/domain/finance-reports";
import { monthLabel, monthRange, todayInLima } from "@/lib/domain/finance-view";
import { formatPrice } from "@/lib/domain/rates-management";
import { getFinanceContext } from "../../_lib/context";

const num = "text-right tabular-nums";
const money = (cents: number) => formatPrice(cents, "PEN");

// The printable income statement (estado de resultados) for a month or a year.
// Owner-only, like every report. The shell hides its navigation when printing, so
// "Imprimir / guardar PDF" produces just this page: logo, period, basis, income
// and expense by category, and the result.
export default async function StatementPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await getFinanceContext();
  if (!ctx || !ctx.isOwner) notFound();

  const now = new Date();
  const params = parseReportParams(await searchParams, now);
  const isYear = params.view === "year";
  const period: Period = isYear
    ? { from: `${params.year}-01-01`, toExclusive: `${params.year + 1}-01-01` }
    : (monthRange(params.month) ?? { from: `${params.month}-01`, toExclusive: `${params.month}-01` });
  const periodLabel = isYear ? String(params.year) : monthLabel(params.month);

  const [data, categories, property, logoUrl] = await Promise.all([
    loadReportData(ctx.supabase, ctx.orgId),
    listCategories(ctx.supabase, ctx.orgId),
    getOrgProperty(ctx.supabase, ctx.orgId),
    getLogoUrl(ctx.supabase, ctx.orgId),
  ]);
  if (!data.ok) {
    return <p role="alert" className="text-sm text-destructive">No se pudo armar el estado de resultados. Revisa los movimientos registrados.</p>;
  }

  const names = new Map(categories.map((c) => [c.id, c.name]));
  const report = periodReport(data.prepared, period, params.basis);
  const income = report.byCategory.filter((c) => c.kind === "income");
  const expense = report.byCategory.filter((c) => c.kind === "expense");
  const back = `/app/finance/reports${reportQuery({ view: isYear ? "year" : "month", basis: params.basis, month: params.month, year: params.year })}`;

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 print:max-w-none">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={back} className="text-sm text-muted-foreground hover:text-foreground">← Volver a Reportes</Link>
        <PrintButton />
      </div>

      <header className="flex items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Estado de resultados</h1>
          <p className="text-lg capitalize text-foreground">{periodLabel}</p>
          <p className="text-sm text-muted-foreground">{property?.name ?? ""}</p>
          <p className="text-xs text-muted-foreground">
            Base de cálculo: {params.basis === "cash" ? "por cobro (fecha en que se cobró o pagó)" : "por estadía (alquiler repartido por noche)"} · Montos en soles ·
            Emitido el {todayInLima(now)}
          </p>
        </div>
        {logoUrl && <Image src={logoUrl} alt={`Logo de ${property?.name ?? "la propiedad"}`} width={96} height={96} className="size-24 object-contain" />}
      </header>

      {data.truncated && (
        <p role="alert" className="text-sm font-medium text-destructive">Hay más de 20.000 movimientos: estas cifras son parciales.</p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Concepto</TableHead>
            <TableHead className={num}>Monto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow className="bg-muted/40 font-semibold"><TableCell colSpan={2}>Ingresos</TableCell></TableRow>
          {income.length === 0 && <TableRow><TableCell colSpan={2} className="text-muted-foreground">Sin ingresos en el período</TableCell></TableRow>}
          {income.map((c) => (
            <TableRow key={c.categoryId}>
              <TableCell className="pl-6">{names.get(c.categoryId) ?? "Sin categoría"}</TableCell>
              <TableCell className={num}>{money(c.totalCents)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="font-semibold">
            <TableCell>Total de ingresos</TableCell>
            <TableCell className={num}>{money(report.totals.incomeCents)}</TableCell>
          </TableRow>

          <TableRow className="bg-muted/40 font-semibold"><TableCell colSpan={2}>Egresos</TableCell></TableRow>
          {expense.length === 0 && <TableRow><TableCell colSpan={2} className="text-muted-foreground">Sin egresos en el período</TableCell></TableRow>}
          {expense.map((c) => (
            <TableRow key={c.categoryId}>
              <TableCell className="pl-6">{names.get(c.categoryId) ?? "Sin categoría"}</TableCell>
              <TableCell className={num}>{money(c.totalCents)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="font-semibold">
            <TableCell>Total de egresos</TableCell>
            <TableCell className={num}>{money(report.totals.expenseCents)}</TableCell>
          </TableRow>

          <TableRow className="border-t-2 border-foreground text-base font-bold">
            <TableCell>Resultado del período (utilidad)</TableCell>
            <TableCell className={num}>{money(report.totals.netCents)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-muted-foreground">Margen sobre ingresos</TableCell>
            <TableCell className={num}>{formatBps(report.totals.marginBps)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <p className="text-xs text-muted-foreground">
        Documento de gestión interna generado desde los movimientos registrados; no reemplaza la contabilidad ni los comprobantes de pago.
      </p>
    </article>
  );
}
