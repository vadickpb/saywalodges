import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listCategories } from "@/lib/dal/finance";
import { loadReportData } from "@/lib/dal/finance-reports";
import { EXPORT_ERRORS } from "@/lib/domain/finance-export";
import { parseReportParams, reportQuery, type ReportParams } from "@/lib/domain/finance-report-view";
import { globalReport, monthReport, yearReport } from "@/lib/domain/finance-reports";
import { monthLabel, shiftMonth, todayInLima } from "@/lib/domain/finance-view";
import { cn } from "cn";
import { getFinanceContext } from "../_lib/context";
import { GlobalView, MonthView, YearView } from "./_views";

const VIEWS = [
  { id: "month", label: "Mensual" },
  { id: "year", label: "Anual" },
  { id: "global", label: "Global" },
] as const;

const BASES = [
  { id: "stay", label: "Por estadía", hint: "El alquiler se reparte por noche entre los meses que cubre. Es la base para ocupación y rendimiento." },
  { id: "cash", label: "Por cobro", hint: "Cada movimiento cuenta entero el día que se cobró o pagó. Es la base para tu contador." },
] as const;

const ERRORS = {
  INVALID_AMOUNT: "Hay un movimiento con un monto inválido.",
  AMOUNT_OVERFLOW: "Los montos suman más de lo que el reporte puede calcular con exactitud.",
  STAY_TOO_LONG: "Hay un alquiler con una estadía demasiado larga.",
  INVALID_STAY: "Hay un alquiler con fechas de estadía inválidas.",
} as const;

function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await getFinanceContext();
  // Owner-only: totals, profit and performance are never shown to staff.
  if (!ctx || !ctx.isOwner) notFound();

  const now = new Date();
  const rawParams = await searchParams;
  const params = parseReportParams(rawParams, now);
  // A refused export lands here with one of a fixed list of codes; anything else is ignored.
  const exportCode = Array.isArray(rawParams.exportError) ? rawParams.exportError[0] : rawParams.exportError;
  const exportError = exportCode !== undefined && exportCode in EXPORT_ERRORS ? EXPORT_ERRORS[exportCode as keyof typeof EXPORT_ERRORS] : null;
  const link = (patch: Partial<ReportParams>) => `/app/finance/reports${reportQuery({ ...params, ...patch })}`;

  const [data, categories] = await Promise.all([loadReportData(ctx.supabase, ctx.orgId), listCategories(ctx.supabase, ctx.orgId)]);
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const currentYear = Number(todayInLima(now).slice(0, 4));

  let body: React.ReactNode;
  let periodNav: React.ReactNode;
  let statementHref: string | null = null;
  let excelHref: { href: string; label: string } | null = null;

  if (!data.ok) {
    body = (
      <Card>
        <CardContent className="pt-6 text-sm text-destructive">No se pudo armar el reporte: {ERRORS[data.error]}</CardContent>
      </Card>
    );
    periodNav = null;
  } else if (params.view === "month") {
    body = <MonthView report={monthReport(data.prepared, params.month, params.basis)} names={names} />;
    periodNav = (
      <nav aria-label="Mes" className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm"><Link href={link({ month: shiftMonth(params.month, -1) })} aria-label="Mes anterior">←</Link></Button>
        <span className="min-w-36 text-center font-medium capitalize text-foreground">{monthLabel(params.month)}</span>
        <Button asChild variant="outline" size="sm"><Link href={link({ month: shiftMonth(params.month, 1) })} aria-label="Mes siguiente">→</Link></Button>
      </nav>
    );
    statementHref = `/app/finance/reports/statement${reportQuery({ view: "month", basis: params.basis, month: params.month })}`;
    excelHref = { href: `/app/finance/export?month=${params.month}`, label: monthLabel(params.month) };
  } else if (params.view === "year") {
    body = <YearView report={yearReport(data.prepared, params.year, params.basis)} />;
    periodNav = (
      <nav aria-label="Año" className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm"><Link href={link({ year: params.year - 1, allTime: false })} aria-label="Año anterior">←</Link></Button>
        <span className="min-w-20 text-center font-medium text-foreground">{params.year}</span>
        <Button asChild variant="outline" size="sm"><Link href={link({ year: params.year + 1, allTime: false })} aria-label="Año siguiente">→</Link></Button>
      </nav>
    );
    statementHref = `/app/finance/reports/statement${reportQuery({ view: "year", basis: params.basis, year: params.year })}`;
    excelHref = { href: `/app/finance/export?year=${params.year}`, label: String(params.year) };
  } else {
    const firstYear = data.firstYear ?? currentYear;
    const period = params.allTime
      ? { from: `${firstYear}-01-01`, toExclusive: `${currentYear + 1}-01-01` }
      : { from: `${params.year}-01-01`, toExclusive: `${params.year + 1}-01-01` };
    const label = params.allTime ? `${firstYear}–${currentYear}` : String(params.year);
    if (!params.allTime) excelHref = { href: `/app/finance/export?year=${params.year}`, label: String(params.year) };
    body = <GlobalView report={globalReport(data.prepared, period, params.basis)} label={label} />;
    const years = Array.from({ length: currentYear - firstYear + 1 }, (_, i) => firstYear + i).reverse();
    periodNav = (
      <nav aria-label="Período" className="flex flex-wrap items-center gap-2">
        <Pill href={link({ allTime: true })} active={params.allTime}>Todo</Pill>
        {years.map((y) => (
          <Pill key={y} href={link({ year: y, allTime: false })} active={!params.allTime && params.year === y}>{y}</Pill>
        ))}
      </nav>
    );
  }

  const basis = BASES.find((b) => b.id === params.basis) ?? BASES[0];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Reportes</h1>
          <Link href="/app/finance" className="text-sm text-muted-foreground hover:text-foreground">← Volver a Finanzas</Link>
        </div>
        {statementHref && (
          <Button asChild size="sm" variant="outline"><Link href={statementHref}>Estado de resultados</Link></Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tipo de reporte">
        {VIEWS.map((v) => (
          <Pill key={v.id} href={link({ view: v.id })} active={params.view === v.id}>{v.label}</Pill>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Base de cálculo">
          {BASES.map((b) => (
            <Pill key={b.id} href={link({ basis: b.id })} active={params.basis === b.id}>{b.label}</Pill>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{basis.hint}</p>
      </div>

      {periodNav}
      {data.ok && data.truncated && (
        <p role="alert" className="text-sm text-destructive">Hay más de 20.000 movimientos: estas cifras son parciales.</p>
      )}
      {body}

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div>
            <h2 id="export-title" className="font-medium text-foreground">Excel para el contador</h2>
            <p className="text-xs text-muted-foreground">
              Siempre por cobro, en soles. Hojas: Resumen, Ingresos, Egresos, Rendimiento (por estadía) y Por alquiler.
              Para un rango propio, «Hasta» incluye ese día y el máximo es de 5 años.
            </p>
            {exportError && <p role="alert" className="mt-2 text-sm text-destructive">{exportError}</p>}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {excelHref && (
              <Button asChild size="sm"><a href={excelHref.href} download>Descargar {excelHref.label}</a></Button>
            )}
            <form action="/app/finance/export" method="get" aria-labelledby="export-title" className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="export-from" className="text-xs">Desde</Label>
                <Input id="export-from" name="from" type="date" required className="w-40" />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="export-to" className="text-xs">Hasta</Label>
                <Input id="export-to" name="to" type="date" required className="w-40" />
              </div>
              <Button type="submit" size="sm" variant="outline">Descargar rango</Button>
            </form>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Todas las cifras están en soles. La ocupación, la tarifa promedio por noche y el ingreso por noche disponible se calculan siempre por noche
        de estadía, sea cual sea la base elegida. Las noches disponibles son los días del período desde que la casa existe (o desde su primera
        reserva cargada) mientras estuvo activa; todavía no se descuentan los días que bloqueas, y las noches futuras del período cuentan como
        disponibles.
      </p>
    </div>
  );
}
