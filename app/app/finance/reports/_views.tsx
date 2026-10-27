import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, formatMoney, formatMoneyTick, formatPercent } from "@/components/dashboard/finance-charts";
import { CHANNEL_LABELS } from "@/lib/domain/finance-forms";
import { formatBps, formatChangeBps, formatNights } from "@/lib/domain/finance-report-view";
import type { Comparison, ReportBasis, GlobalReport, MonthReport, PeriodReport, UnitPerformance, YearReport } from "@/lib/domain/finance-reports";
import { monthLabel } from "@/lib/domain/finance-view";

// Server-rendered report sections. Every figure comes from the pure engine
// (lib/domain/finance-reports.ts); nothing is recomputed here, so the screen, the
// printable statement and the Excel export cannot disagree.

const money = (cents: number | null) => (cents === null ? "—" : formatMoney(cents));
const num = "text-right tabular-nums";
const channelLabel = (channel: keyof typeof CHANNEL_LABELS | null) => (channel === null ? "Sin canal" : CHANNEL_LABELS[channel]);

export type CategoryNames = Map<string, string>;

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="break-inside-avoid">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Totals({ report }: { report: PeriodReport }) {
  const t = report.totals;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard label="Ingresos" value={money(t.incomeCents)} />
      <MetricCard label="Egresos" value={money(t.expenseCents)} />
      <MetricCard label="Utilidad" value={money(t.netCents)} />
      <MetricCard label="Margen" value={formatBps(t.marginBps)} />
    </div>
  );
}

function Performance({ report }: { report: PeriodReport }) {
  const p = report.performance;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard label="Ocupación" value={formatBps(p.occupancyBps)} />
      <MetricCard label="Tarifa promedio por noche" value={money(p.adrCents)} />
      <MetricCard label="Ingreso por noche disponible" value={money(p.revparCents)} />
      <MetricCard label="Noches reservadas / disponibles" value={`${p.bookedNights} / ${p.availableNights}`} />
    </div>
  );
}

function UnitsTable({ units, basis }: { units: UnitPerformance[]; basis: ReportBasis }) {
  if (units.length === 0) return <p className="text-sm text-muted-foreground">No hay casas registradas.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Casa</TableHead>
          <TableHead className={num}>Noches reservadas</TableHead>
          <TableHead className={num}>Disponibles</TableHead>
          <TableHead className={num}>Ocupación</TableHead>
          <TableHead className={num}>Tarifa prom.</TableHead>
          <TableHead className={num}>Por noche disp.</TableHead>
          <TableHead className={num}>{rentalsHeader(basis)}</TableHead>
          <TableHead className={num}>Estadía prom.</TableHead>
          <TableHead className={num}>Ingresos</TableHead>
          <TableHead className={num}>Egresos</TableHead>
          <TableHead className={num}>Utilidad</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {units.map((u) => (
          <TableRow key={u.unitId}>
            <TableCell className="font-medium">{u.name}</TableCell>
            <TableCell className={num}>{u.bookedNights}</TableCell>
            <TableCell className={num}>{u.availableNights}</TableCell>
            <TableCell className={num}>{formatBps(u.occupancyBps)}</TableCell>
            <TableCell className={num}>{money(u.adrCents)}</TableCell>
            <TableCell className={num}>{money(u.revparCents)}</TableCell>
            <TableCell className={num}>{u.rentals}</TableCell>
            <TableCell className={num}>{formatNights(u.avgStayNights)}</TableCell>
            <TableCell className={num}>{money(u.incomeCents)}</TableCell>
            <TableCell className={num}>{money(u.expenseCents)}</TableCell>
            <TableCell className={num}>{money(u.netCents)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ChannelsTable({ report }: { report: PeriodReport }) {
  if (report.byChannel.length === 0) return <p className="text-sm text-muted-foreground">Sin ingresos en este período.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Canal</TableHead>
          <TableHead className={num}>Bruto</TableHead>
          <TableHead className={num}>Comisión</TableHead>
          <TableHead className={num}>Neto</TableHead>
          <TableHead className={num}>{rentalsHeader(report.basis)}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {report.byChannel.map((c) => (
          <TableRow key={c.channel ?? "none"}>
            <TableCell className="font-medium">{channelLabel(c.channel)}</TableCell>
            <TableCell className={num}>{money(c.grossCents)}</TableCell>
            <TableCell className={num}>{money(c.commissionCents)}</TableCell>
            <TableCell className={num}>{money(c.netCents)}</TableCell>
            <TableCell className={num}>{c.rentals}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function TopExpenses({ report, names }: { report: PeriodReport; names: CategoryNames }) {
  if (report.topExpenses.length === 0) return <p className="text-sm text-muted-foreground">Sin egresos en este período.</p>;
  return (
    <ol className="flex flex-col gap-1.5 text-sm">
      {report.topExpenses.map((c) => (
        <li key={c.categoryId} className="flex justify-between gap-3 border-b border-border pb-1.5 last:border-0">
          <span>{names.get(c.categoryId) ?? "Sin categoría"}</span>
          <span className="tabular-nums">{money(c.totalCents)}</span>
        </li>
      ))}
    </ol>
  );
}

const pts = (points: number | null) => (points === null ? "—" : formatChangeBps(points).replace(" %", " pts"));

// "Alquileres" means different things per basis: say which one.
function rentalsHeader(basis: ReportBasis) {
  return basis === "cash" ? "Alquileres cobrados" : "Alquileres con noches";
}

function ComparisonTable({ rows }: { rows: { current: PeriodReport; baseline: PeriodReport; vs: Comparison; title: string }[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Comparación</TableHead>
          <TableHead className={num}>Ahora</TableHead>
          <TableHead className={num}>Antes</TableHead>
          <TableHead className={num}>Variación</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.flatMap((r) => [
          <TableRow key={`${r.title}-i`}>
            <TableCell className="font-medium">{r.title}: Ingresos</TableCell>
            <TableCell className={num}>{money(r.current.totals.incomeCents)}</TableCell>
            <TableCell className={num}>{money(r.baseline.totals.incomeCents)}</TableCell>
            <TableCell className={num}>{formatChangeBps(r.vs.income.pctBps)}</TableCell>
          </TableRow>,
          <TableRow key={`${r.title}-e`}>
            <TableCell className="font-medium">{r.title}: Egresos</TableCell>
            <TableCell className={num}>{money(r.current.totals.expenseCents)}</TableCell>
            <TableCell className={num}>{money(r.baseline.totals.expenseCents)}</TableCell>
            <TableCell className={num}>{formatChangeBps(r.vs.expense.pctBps)}</TableCell>
          </TableRow>,
          <TableRow key={`${r.title}-n`}>
            <TableCell className="font-medium">{r.title}: Utilidad</TableCell>
            <TableCell className={num}>{money(r.current.totals.netCents)}</TableCell>
            <TableCell className={num}>{money(r.baseline.totals.netCents)}</TableCell>
            <TableCell className={num}>{formatChangeBps(r.vs.net.pctBps)}</TableCell>
          </TableRow>,
          <TableRow key={`${r.title}-o`}>
            <TableCell className="font-medium">{r.title}: Ocupación</TableCell>
            <TableCell className={num}>{formatBps(r.current.performance.occupancyBps)}</TableCell>
            <TableCell className={num}>{formatBps(r.baseline.performance.occupancyBps)}</TableCell>
            <TableCell className={num}>{pts(r.vs.occupancyPointsBps)}</TableCell>
          </TableRow>,
        ])}
      </TableBody>
    </Table>
  );
}

// ─── Monthly ────────────────────────────────────────────────────────────────

export function MonthView({ report, names }: { report: MonthReport; names: CategoryNames }) {
  const cur = report.current;
  return (
    <div className="flex flex-col gap-5">
      <Totals report={cur} />
      <Performance report={cur} />
      <Section title="Contra el mes anterior y el mismo mes del año pasado" hint="La variación es sobre el valor de antes; «—» cuando antes no había datos.">
        <ComparisonTable
          rows={[
            { title: "Mes anterior", current: cur, baseline: report.previousMonth, vs: report.vsPreviousMonth },
            { title: "Año pasado", current: cur, baseline: report.sameMonthLastYear, vs: report.vsLastYear },
          ]}
        />
      </Section>
      <Section title="Por casa">
        <UnitsTable units={cur.units} basis={cur.basis} />
        {(cur.general.incomeCents > 0 || cur.general.expenseCents > 0) && (
          <p className="mt-3 text-sm text-muted-foreground">
            Sin casa (gastos o ingresos generales): ingresos {money(cur.general.incomeCents)}, egresos {money(cur.general.expenseCents)}.
          </p>
        )}
      </Section>
      <Section title="Por canal" hint="Bruto menos la comisión de la plataforma.">
        <ChannelsTable report={cur} />
      </Section>
      <Section title="Mayores egresos">
        <TopExpenses report={cur} names={names} />
      </Section>
    </div>
  );
}

// ─── Annual ─────────────────────────────────────────────────────────────────

const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function YearView({ report }: { report: YearReport }) {
  const labels = report.months.map((m) => MONTH_SHORT[Number(m.month.slice(5, 7)) - 1]);
  const t = report.total;
  return (
    <div className="flex flex-col gap-5">
      <Totals report={t} />
      <Performance report={t} />
      <div className="grid gap-6 lg:grid-cols-2">
        <BarChart
          title={`Ingresos y egresos por mes, ${report.year}`}
          description="Barras agrupadas por mes: ingresos y egresos en soles."
          labels={labels}
          series={[
            { name: "Ingresos", values: report.months.map((m) => m.incomeCents) },
            { name: "Egresos", values: report.months.map((m) => m.expenseCents) },
          ]}
          format={formatMoney}
          tickFormat={formatMoneyTick}
        />
        <BarChart
          title={`Ocupación por mes, ${report.year}`}
          description="Barras por mes con el porcentaje de noches disponibles que estuvieron reservadas."
          labels={labels}
          series={[{ name: "Ocupación", values: report.months.map((m) => m.occupancyBps ?? 0) }]}
          format={formatPercent}
        />
      </div>
      <Section title="Mes a mes">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mes</TableHead>
              <TableHead className={num}>Ingresos</TableHead>
              <TableHead className={num}>Egresos</TableHead>
              <TableHead className={num}>Utilidad</TableHead>
              <TableHead className={num}>Ocupación</TableHead>
              <TableHead className={num}>Tarifa prom.</TableHead>
              <TableHead className={num}>Noches</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.months.map((m) => (
              <TableRow key={m.month}>
                <TableCell className="font-medium capitalize">{monthLabel(m.month)}</TableCell>
                <TableCell className={num}>{money(m.incomeCents)}</TableCell>
                <TableCell className={num}>{money(m.expenseCents)}</TableCell>
                <TableCell className={num}>{money(m.netCents)}</TableCell>
                <TableCell className={num}>{formatBps(m.occupancyBps)}</TableCell>
                <TableCell className={num}>{money(m.adrCents)}</TableCell>
                <TableCell className={num}>{m.bookedNights}</TableCell>
              </TableRow>
            ))}
            <TableRow className="font-semibold">
              <TableCell>Total {report.year}</TableCell>
              <TableCell className={num}>{money(t.totals.incomeCents)}</TableCell>
              <TableCell className={num}>{money(t.totals.expenseCents)}</TableCell>
              <TableCell className={num}>{money(t.totals.netCents)}</TableCell>
              <TableCell className={num}>{formatBps(t.performance.occupancyBps)}</TableCell>
              <TableCell className={num}>{money(t.performance.adrCents)}</TableCell>
              <TableCell className={num}>{t.performance.bookedNights}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Section>
      <Section title="Contra el año anterior y estacionalidad">
        <ComparisonTable rows={[{ title: String(report.year - 1), current: t, baseline: report.previousYear, vs: report.vsPreviousYear }]} />
        <p className="mt-3 text-sm text-muted-foreground">
          {report.best && report.worst
            ? `Mejor mes: ${monthLabel(report.best.month)} (${money(report.best.netCents)}). Peor mes: ${monthLabel(report.worst.month)} (${money(report.worst.netCents)}). `
            : "Todavía no hay meses con movimiento. "}
          La ocupación mes a mes del gráfico muestra qué meses llenas y cuáles no; úsala para ajustar tus temporadas en Tarifas.
        </p>
      </Section>
    </div>
  );
}

// ─── Global ─────────────────────────────────────────────────────────────────

export function GlobalView({ report, label }: { report: GlobalReport; label: string }) {
  const r = report.report;
  const { directSavings: savings } = report;
  return (
    <div className="flex flex-col gap-5">
      <Totals report={r} />
      <Performance report={r} />
      <Section title={`Ranking de casas (${label})`} hint="Ordenado por utilidad, no por ingresos.">
        <UnitsTable units={report.ranking} basis={report.report.basis} />
      </Section>
      <Section title="Mezcla de canales" hint="Porcentaje del ingreso bruto; cada porcentaje se redondea, así que pueden no sumar exactamente 100 %.">
        {report.channelMix.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin ingresos en este período.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {report.channelMix.map((c) => (
              <li key={c.channel ?? "none"} className="flex justify-between gap-3 border-b border-border pb-1.5 last:border-0">
                <span>{channelLabel(c.channel)}</span>
                <span className="tabular-nums">
                  {money(c.grossCents)} · ≈ {formatBps(c.shareBps)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Lo que ahorran las reservas directas" hint="Estimación referencial, no una medición.">
        {savings.estimatedCents === null || savings.platformCommissionRateBps === null ? (
          <p className="text-sm text-muted-foreground">
            No hay ingresos de Airbnb o Booking con comisión registrada en este período, así que no se puede estimar.
          </p>
        ) : (
          <p className="text-sm">
            Con la comisión promedio de tus reservas de plataforma ({formatBps(savings.platformCommissionRateBps)} del bruto), tus reservas directas habrían
            pagado unos <strong>{money(savings.estimatedCents)}</strong> en comisiones. Supone que la misma demanda habría llegado por la plataforma al mismo
            precio y que registraste cada comisión.
          </p>
        )}
      </Section>
      <Section title="Costo promedio por alquiler" hint="Solo los costos ligados a un alquiler al registrarlo; el mantenimiento rara vez se liga a uno.">
        <p className="text-sm">
          Limpieza ligada a alquileres: <strong>{money(report.avgCleaningPerRentalCents)}</strong> · Mantenimiento ligado a alquileres:{" "}
          <strong>{money(report.avgMaintenancePerRentalCents)}</strong>
        </p>
      </Section>
    </div>
  );
}
