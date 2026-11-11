import Link from "next/link";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { z } from "zod";
import { getCalendarContext, readCalendar, CALENDAR_ERROR } from "@/lib/dal/calendar";
import { calendarMonth, blockStyle, CALENDAR_SOURCES } from "@/lib/domain/calendar";
import { addDays, currentMonthInLima, isIsoMonth } from "@/lib/domain/dates";
import { blockedDatesInMonth, rangeContains } from "@/lib/domain/availability";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getPricingData } from "@/lib/dal/rates";
import { nightlyPrices } from "@/lib/domain/nightly-prices";
import { AirbnbCalendar } from "@/components/dashboard/airbnb-calendar";
import { CalendarBlockForm } from "@/components/dashboard/calendar-block-form";
import { RowAction } from "@/components/dashboard/row-action";
import { deleteManualBlockAction } from "./actions";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await getCalendarContext();
  if (!ctx) return <p>No tienes una propiedad activa.</p>;
  const { activeOrg } = await requireActiveOrg();
  const params = await searchParams;
  const month = typeof params.month === "string" && isIsoMonth(params.month) ? params.month : currentMonthInLima();
  const rawUnit = params.unit;
  const compact = rawUnit === "all";
  const unitId = typeof rawUnit === "string" && z.uuid().safeParse(rawUnit).success ? rawUnit : undefined;
  if (rawUnit && !unitId && !compact) return <p role="alert">Selecciona una unidad válida. <Link href="/app/calendar" className="underline">Ver calendario</Link></p>;
  let data;
  try { data = await readCalendar(ctx, month, unitId); }
  catch { return <p role="alert">{CALENDAR_ERROR}</p>; }
  if (data.invalidUnit) return <p role="alert">Unidad no disponible. <Link href="/app/calendar" className="underline">Ver todas las unidades</Link></p>;
  const { units } = data;
  // Default view is the new calendar of the first house; "Todas" (unit=all) keeps the compact overview.
  const selected = units.find((unit) => unit.id === (unitId ?? (compact ? undefined : units[0]?.id)));
  const blocks = selected ? data.blocks.filter((block) => block.unitId === selected.id) : data.blocks;
  const bounds = calendarMonth(month);
  // Display-only prices (SD-421): a pricing failure must never hide the calendar.
  let prices: Record<string, number | null> = {};
  let currency: "PEN" | "USD" = "PEN";
  if (selected) {
    try {
      const pricing = await getPricingData();
      if (pricing) { currency = pricing.currency; prices = nightlyPrices(selected.id, bounds.dates, pricing.rates, pricing.seasons, pricing.currency); }
    } catch { prices = {}; }
  }
  const href = (target: string) => `/app/calendar?${new URLSearchParams({ month: target, unit: selected?.id ?? "all" })}`;
  return <div className="min-w-0 space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Calendario</h1><p className="text-sm text-muted-foreground">Noches ocupadas · America/Lima · la fecha de salida queda libre.</p></div>
      {activeOrg?.role === "owner" && (
        <Link href="/app/calendar/feeds" className="rounded border px-3 py-2 text-sm font-medium">Calendarios para Airbnb y Booking</Link>
      )}
    </div>
    <Card><CardHeader><CardTitle>Ocupación mensual</CardTitle></CardHeader><CardContent className="space-y-4">
      <form key={`${month}-${selected?.id ?? "all"}`} className="flex flex-col gap-3 sm:flex-row sm:items-end" method="get">
        <div className="space-y-2"><Label htmlFor="calendar-month">Mes</Label><input id="calendar-month" name="month" type="month" defaultValue={month} required className="h-11 w-full rounded-md border bg-background px-3" /></div>
        <div className="min-w-0 space-y-2 sm:flex-1"><Label htmlFor="calendar-unit">Unidad / vista</Label><select id="calendar-unit" name="unit" defaultValue={selected?.id ?? "all"} className="h-11 w-full rounded-md border bg-background px-3"><option value="all">Todas · vista compacta</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.active ? "" : " (inactiva)"}</option>)}</select></div>
        <Button type="submit">Ver calendario</Button>
      </form>
      {!selected && <nav aria-label="Navegación mensual" className="flex flex-wrap items-center justify-between gap-3">
        {bounds.previous ? <Link className="rounded border px-3 py-2 text-sm" href={href(bounds.previous)}>← Anterior</Link> : <span />}
        <h2 className="font-semibold">{month}</h2>
        {bounds.next ? <Link className="rounded border px-3 py-2 text-sm" href={href(bounds.next)}>Siguiente →</Link> : <span />}
      </nav>}
      <ul aria-label="Leyenda de fuentes" className="flex flex-wrap gap-2 text-xs">{Object.entries(CALENDAR_SOURCES).map(([key, source]) => <li key={key} className={`rounded border px-2 py-1 ${source.className}`}>{source.short} · {source.label}</li>)}</ul>
      <p className="text-xs text-muted-foreground">Los bloques importados por iCal toman el canal del calendario conectado (Airbnb, Booking, Vrbo). · = libre.</p>
      {units.length === 0 ? <p>Aún no hay unidades. <Link href="/app/site/units" className="underline">Configurar unidades</Link></p> : selected ? <AirbnbCalendar key={selected.id} month={month} unit={selected} blocks={blocks} prices={prices} currency={currency} /> : <div className="space-y-4">{units.map((unit) => {
        const unitBlocks = blocks.filter((block) => block.unitId === unit.id);
        const occupied = blockedDatesInMonth(unitBlocks, month).length;
        return <section key={unit.id} className="rounded-lg border p-3"><Link href={`/app/calendar?${new URLSearchParams({ month, unit: unit.id })}`} className="font-semibold underline">{unit.name}{unit.active ? "" : " (inactiva)"}</Link><p className="mb-2 text-xs text-muted-foreground">{occupied} de {bounds.days} noches ocupadas</p><div className="flex flex-wrap gap-1" aria-label={`Días de ${unit.name}`}>{bounds.dates.map((date) => {
          const block = unitBlocks.find((block) => rangeContains(block, date));
          const source = block ? blockStyle(block) : null;
          return <span key={date} role="img" className={`flex h-10 w-10 flex-col items-center justify-center rounded border text-xs ${source?.className ?? "bg-background"}`} aria-label={`${date}: ${source?.label ?? "Libre"}`}><span aria-hidden="true">{Number(date.slice(-2))}<br />{source?.short ?? "·"}</span></span>;
        })}</div></section>;
      })}</div>}
    </CardContent></Card>
    {units.length > 0 && !selected && <Card><CardHeader><CardTitle>Crear bloqueo manual</CardTitle></CardHeader><CardContent><CalendarBlockForm key={`${month}-${unitId ?? "all"}`} units={units} unitId={unitId} start={bounds.start} end={addDays(bounds.start, 1)} /></CardContent></Card>}
    <Card><CardHeader><CardTitle>Bloques del mes{selected ? ` · ${selected.name}` : ""}</CardTitle></CardHeader><CardContent>
      {blocks.length === 0 ? <p className="text-sm text-muted-foreground">No hay bloques en este mes.</p> : <ul className="space-y-3">{blocks.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id)).map((block) => <li key={block.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1"><p className="break-words font-medium">{units.find((unit) => unit.id === block.unitId)?.name ?? "Unidad"}</p><p className="text-sm">{block.start} → {block.end} (salida libre)</p><span className={`inline-block rounded border px-2 py-1 text-xs ${blockStyle(block).className}`}>{blockStyle(block).label}</span>{block.note && <p className="whitespace-pre-wrap break-words text-sm">{block.note}</p>}</div>
        {block.source === "manual" && <RowAction action={deleteManualBlockAction} fields={{ id: block.id }} label="Eliminar bloqueo" ariaLabel={`Eliminar bloqueo del ${block.start} al ${block.end}`} confirm={{ title: "¿Eliminar bloqueo manual?", description: `${block.start} → ${block.end}. ${block.note ?? "Sin nota."} Las noches quedarán libres.` }} successMessage="Bloqueo eliminado" />}
      </li>)}</ul>}
    </CardContent></Card>
  </div>;
}
