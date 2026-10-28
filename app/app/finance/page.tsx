import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { RowAction } from "@/components/dashboard/row-action";
import { PendingExpenses, type PendingItemData } from "@/components/dashboard/recurring-pending";
import { LEDGER_LIMIT, getLastFxRate, listCategories, listEntries, listLinkedCosts, type LedgerEntry } from "@/lib/dal/finance";
import { listConfirmed, listTemplates } from "@/lib/dal/finance-recurring";
import { listUnits } from "@/lib/dal/units";
import { rentalProfits, summarizeEntries, type FinanceEntry } from "@/lib/domain/finance";
import { CHANNEL_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/domain/finance-forms";
import { centsToText, overdueMonths, pendingForMonth } from "@/lib/domain/finance-recurring";
import { addDays } from "@/lib/domain/finance-reports";
import { currentMonth, ledgerQuery, monthLabel, monthRange, parseLedgerView, shiftMonth } from "@/lib/domain/finance-view";
import { formatPrice } from "@/lib/domain/rates-management";
import { deleteEntryAction } from "./actions";
import { confirmRecurringAction } from "./recurring/actions";
import { getFinanceContext } from "./_lib/context";

const selectClass = "h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

function shortDate(iso: string) {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await getFinanceContext();
  if (!ctx) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">No tienes una organización activa.</CardContent>
      </Card>
    );
  }
  const view = parseLedgerView(await searchParams, currentMonth(new Date()));
  const filtersActive = Boolean(view.kind || view.categoryId || view.unitId || view.general);
  const [categories, units, ledger] = await Promise.all([
    listCategories(ctx.supabase, ctx.orgId),
    listUnits(ctx.supabase, ctx.orgId),
    listEntries(ctx.supabase, ctx.orgId, {
      month: view.month, kind: view.kind, categoryId: view.categoryId, unitId: view.unitId, general: view.general,
    }),
  ]);
  // The cards are the MONTH's totals whatever filters narrow the list below; the
  // owner gets a second, unfiltered read only when filters are active.
  const monthLedger = !ctx.isOwner ? null : filtersActive ? await listEntries(ctx.supabase, ctx.orgId, { month: view.month }) : ledger;
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const unitName = new Map(units.map((u) => [u.id, u.name]));

  // Owner-only figures: totals and per-rental profit. Staff get the list of
  // their own entries and nothing derived from the rest of the ledger.
  const toFinance = (e: LedgerEntry): FinanceEntry => ({
    id: e.id, kind: e.kind, categoryId: e.categoryId, categoryKey: categoryById.get(e.categoryId)?.systemKey ?? null,
    occurredOn: e.occurredOn, amountPenCents: e.amountPenCents, unitId: e.unitId, relatedEntryId: e.relatedEntryId,
    stayStart: e.stayStart, stayEnd: e.stayEnd,
  });
  const summary = monthLedger ? summarizeEntries(monthLedger.entries.map(toFinance)) : null;
  const profitByRental = new Map<string, { gross: number; commission: number; other: number; net: number }>();
  if (ctx.isOwner) {
    const rentals = ledger.entries.filter((e) => e.kind === "income" && e.stayStart !== null);
    const linked = await listLinkedCosts(ctx.supabase, ctx.orgId, rentals.map((r) => r.id));
    const profits = rentalProfits([...rentals.map(toFinance), ...linked.map(toFinance)]);
    if (profits.ok) {
      for (const p of profits.rentals) {
        profitByRental.set(p.rentalId, { gross: p.grossCents, commission: p.commissionCents, other: p.otherCostsCents, net: p.netCents });
      }
    }
  }

  // Recurring expenses (owner-only): what is still pending in the month shown,
  // and the earlier months that still have something unconfirmed.
  let pendingItems: PendingItemData[] = [];
  let overdue: string[] = [];
  if (ctx.isOwner) {
    const thisMonth = currentMonth(new Date());
    const templates = await listTemplates(ctx.supabase, ctx.orgId);
    if (templates.some((t) => t.active)) {
      const months = [view.month, ...Array.from({ length: 12 }, (_, i) => shiftMonth(thisMonth, -(i + 1)))];
      const confirmed = await listConfirmed(ctx.supabase, ctx.orgId, months);
      const pending = pendingForMonth(templates, confirmed.get(view.month) ?? new Set(), view.month, thisMonth);
      overdue = overdueMonths(templates, confirmed, thisMonth).filter((m) => m !== view.month);
      const usd = pending.some((p) => p.template.currency === "USD") ? await getLastFxRate(ctx.supabase, ctx.orgId, "USD") : null;
      const range = monthRange(view.month);
      pendingItems = pending.map((p) => ({
        recurringId: p.template.id,
        month: `${p.month}-01`,
        name: p.template.name,
        dueOn: p.dueOn,
        dueLabel: shortDate(p.dueOn),
        monthStart: range?.from ?? `${p.month}-01`,
        monthEnd: range ? addDays(range.toExclusive, -1) : p.dueOn,
        estimated: centsToText(p.template.estimatedCents),
        estimatedLabel: formatPrice(p.template.estimatedCents, p.template.currency),
        currency: p.template.currency,
        supplier: p.template.counterparty,
        lastFxRate: usd === null ? "" : String(usd),
      }));
    }
  }

  const prev = ledgerQuery({ ...view, month: shiftMonth(view.month, -1) });
  const next = ledgerQuery({ ...view, month: shiftMonth(view.month, 1) });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Finanzas</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm"><Link href="/app/finance/new?type=rental">+ Alquiler</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href="/app/finance/new?type=income">+ Ingreso</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href="/app/finance/new?type=expense">+ Egreso</Link></Button>
          {ctx.isOwner && <Button asChild size="sm" variant="secondary"><Link href="/app/finance/reports">Reportes</Link></Button>}
          {ctx.isOwner && <Button asChild size="sm" variant="secondary"><Link href="/app/finance/recurring">Recurrentes</Link></Button>}
        </div>
      </div>

      <nav aria-label="Mes" className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm"><Link href={`/app/finance${prev}`} aria-label="Mes anterior">←</Link></Button>
        <span className="min-w-36 text-center font-medium capitalize text-foreground">{monthLabel(view.month)}</span>
        <Button asChild variant="outline" size="sm"><Link href={`/app/finance${next}`} aria-label="Mes siguiente">→</Link></Button>
      </nav>

      {ctx.isOwner && overdue.length > 0 && (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Tienes gastos recurrentes sin confirmar en:{" "}
          {overdue.map((m, i) => (
            <span key={m}>
              {i > 0 && ", "}
              <Link href={`/app/finance?month=${m}`} className="font-medium capitalize text-foreground underline">{monthLabel(m)}</Link>
            </span>
          ))}
          .
        </p>
      )}
      {pendingItems.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <div>
              <h2 className="font-medium text-foreground">Gastos recurrentes pendientes de {monthLabel(view.month)}</h2>
              <p className="text-xs text-muted-foreground">Confirma cada uno con el monto real: recién ahí se registra como egreso.</p>
            </div>
            <PendingExpenses action={confirmRecurringAction} items={pendingItems} />
          </CardContent>
        </Card>
      )}

      {summary?.ok && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Ingresos" value={formatPrice(summary.summary.incomeCents, "PEN")} />
          <MetricCard label="Egresos" value={formatPrice(summary.summary.expenseCents, "PEN")} />
          <MetricCard label="Utilidad" value={formatPrice(summary.summary.netCents, "PEN")} />
          <MetricCard label="Margen" value={summary.summary.marginBps === null ? "—" : `${(summary.summary.marginBps / 100).toFixed(1)} %`} />
        </div>
      )}
      {summary && !summary.ok && <p className="text-sm text-destructive">No se pudieron calcular los totales.</p>}
      {summary?.ok && (
        <p className="-mt-3 text-xs text-muted-foreground">
          Totales del mes en soles, por fecha de cobro.
          {monthLedger?.truncated && ` Hay más de ${LEDGER_LIMIT} movimientos este mes: estos totales son parciales.`}
        </p>
      )}

      <form method="get" action="/app/finance" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="month" value={view.month} />
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Tipo
          <select name="kind" defaultValue={view.kind ?? ""} className={selectClass}>
            <option value="">Todos</option><option value="income">Ingresos</option><option value="expense">Egresos</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Categoría
          <select name="category" defaultValue={view.categoryId ?? ""} className={selectClass}>
            <option value="">Todas</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Casa
          <select name="unit" defaultValue={view.general ? "general" : (view.unitId ?? "")} className={selectClass}>
            <option value="">Todas</option><option value="general">General</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <Button type="submit" size="sm" variant="secondary">Filtrar</Button>
        <Button asChild size="sm" variant="ghost"><Link href={`/app/finance?month=${view.month}`}>Limpiar</Link></Button>
      </form>

      {ledger.entries.length === 0 ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">No hay movimientos en {monthLabel(view.month)}.</CardContent></Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {ledger.entries.map((e) => {
            const profit = profitByRental.get(e.id);
            const category = categoryById.get(e.categoryId)?.name ?? "Sin categoría";
            return (
              <li key={e.id}>
                <Card>
                  <CardContent className="flex flex-col gap-2 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                          <Badge variant={e.kind === "income" ? "default" : "secondary"}>{e.kind === "income" ? "Ingreso" : "Egreso"}</Badge>
                          {category}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {shortDate(e.occurredOn)}
                          {e.unitId && ` · ${unitName.get(e.unitId) ?? "Casa"}`}
                          {!e.unitId && e.kind === "expense" && " · General"}
                          {e.counterparty && ` · ${e.counterparty}`}
                          {e.paymentMethod && ` · ${PAYMENT_METHOD_LABELS[e.paymentMethod]}`}
                        </p>
                        {e.stayStart && e.stayEnd && (
                          <p className="text-sm text-muted-foreground">
                            Estadía {shortDate(e.stayStart)}–{shortDate(e.stayEnd)}
                            {e.channel && ` · ${CHANNEL_LABELS[e.channel]}`}
                            {e.guests !== null && ` · ${e.guests} ${e.guests === 1 ? "huésped" : "huéspedes"}`}
                          </p>
                        )}
                        {e.note && <p className="text-sm text-muted-foreground">{e.note}</p>}
                      </div>
                      <div className="text-right">
                        <p className={e.kind === "income" ? "text-lg font-semibold text-green-700 dark:text-green-400" : "text-lg font-semibold text-foreground"}>
                          {e.kind === "expense" && "− "}{formatPrice(e.amountCents, e.currency)}
                        </p>
                        {e.currency !== "PEN" && <p className="text-xs text-muted-foreground">≈ {formatPrice(e.amountPenCents, "PEN")}</p>}
                      </div>
                    </div>
                    {profit && (
                      <p className="rounded-md bg-muted px-3 py-1.5 text-sm text-muted-foreground">
                        Comisión {formatPrice(profit.commission, "PEN")} · Otros costos {formatPrice(profit.other, "PEN")} ·{" "}
                        <strong className="text-foreground">Utilidad {formatPrice(profit.net, "PEN")}</strong>
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {e.hasReceipt && (
                        <Button asChild size="sm" variant="outline">
                          <a href={`/app/finance/receipt/${e.id}`} target="_blank" rel="noopener noreferrer">Ver comprobante</a>
                        </Button>
                      )}
                      <Button asChild size="sm" variant="outline"><Link href={`/app/finance/${e.id}`}>Editar</Link></Button>
                      <RowAction
                        action={deleteEntryAction}
                        fields={{ id: e.id }}
                        label="Eliminar"
                        ariaLabel={`Eliminar ${category} del ${shortDate(e.occurredOn)}`}
                        variant="destructive"
                        confirm={{
                          title: "¿Eliminar este movimiento?",
                          description: e.stayStart
                            ? "Se borra el alquiler junto con su comisión, su limpieza y los comprobantes. No se puede deshacer."
                            : "También se borra su comprobante. No se puede deshacer.",
                        }}
                        successMessage="Movimiento eliminado"
                      />
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {ledger.truncated && <p className="text-sm text-muted-foreground">Se muestran los {LEDGER_LIMIT} más recientes. Usa los filtros para acotar.</p>}
    </div>
  );
}
