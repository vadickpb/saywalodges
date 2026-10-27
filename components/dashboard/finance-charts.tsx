import { barChartLayout, formatBps, type ChartSeries } from "@/lib/domain/finance-report-view";
import { formatPrice } from "@/lib/domain/rates-management";

// Pure SVG, no chart library: the geometry comes from barChartLayout (unit-tested)
// and the markup renders on the server. Every chart carries a title/description
// for assistive technology and a collapsible data table, so the numbers are never
// only in the picture.

const BOX = { width: 640, height: 240, left: 72, right: 8, top: 12, bottom: 28 };
const SERIES_CLASS = ["fill-primary", "fill-muted-foreground"];
const SWATCH_CLASS = ["bg-primary", "bg-muted-foreground"];

type ChartProps = {
  title: string;
  description: string;
  labels: string[];
  series: ChartSeries[];
  // How to print a value in the tooltip and the data table.
  format: (value: number) => string;
  // Shorter text for the axis labels (defaults to `format`).
  tickFormat?: (value: number) => string;
};

export function BarChart({ title, description, labels, series, format, tickFormat = format }: ChartProps) {
  const layout = barChartLayout(labels, series, BOX);
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <figure className="flex flex-col gap-2 break-inside-avoid">
      <figcaption className="text-sm font-medium text-foreground">{title}</figcaption>
      <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} role="img" aria-labelledby={`${id}-t ${id}-d`} className="w-full max-w-3xl">
        <title id={`${id}-t`}>{title}</title>
        <desc id={`${id}-d`}>{description}</desc>
        {layout.ticks.map((tick) => (
          <g key={tick.y}>
            <line x1={BOX.left} x2={BOX.width - BOX.right} y1={tick.y} y2={tick.y} className="stroke-border" strokeWidth={1} />
            <text x={BOX.left - 6} y={tick.y + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
              {tickFormat(tick.value)}
            </text>
          </g>
        ))}
        {layout.bars.map((bar) => (
          <rect key={`${bar.label}-${bar.series}`} x={bar.x} y={bar.y} width={bar.width} height={bar.height} className={SERIES_CLASS[bar.series % SERIES_CLASS.length]}>
            <title>{`${series[bar.series].name}, ${bar.label}: ${format(bar.value)}`}</title>
          </rect>
        ))}
        {layout.labels.map((label) => (
          <text key={label.text} x={label.x} y={BOX.height - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            {label.text}
          </text>
        ))}
      </svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {series.map((s, i) => (
          <li key={s.name} className="flex items-center gap-1.5">
            <span aria-hidden className={`inline-block size-2.5 rounded-sm ${SWATCH_CLASS[i % SWATCH_CLASS.length]}`} />
            {s.name}
          </li>
        ))}
      </ul>
      <details className="text-sm print:hidden">
        <summary className="cursor-pointer text-muted-foreground">Ver los datos del gráfico</summary>
        <table className="mt-2 w-full max-w-3xl text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="py-1 pr-3 font-medium">Mes</th>
              {series.map((s) => (
                <th key={s.name} scope="col" className="py-1 pr-3 text-right font-medium">{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((label, i) => (
              <tr key={label} className="border-b border-border last:border-0">
                <th scope="row" className="py-1 pr-3 text-left font-normal">{label}</th>
                {series.map((s) => (
                  <td key={s.name} className="py-1 pr-3 text-right tabular-nums">{format(s.values[i] ?? 0)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

// Whole soles for the axis ("S/ 12,500"); the full amount stays in tooltips and the data table.
export const formatMoneyTick = (cents: number) => `S/ ${new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 }).format(Math.round(cents / 100))}`;
export const formatMoney = (cents: number) => formatPrice(Math.round(cents), "PEN");
export const formatPercent = (bps: number) => formatBps(Math.round(bps));
