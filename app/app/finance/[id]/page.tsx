import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FinanceForm } from "@/components/dashboard/finance-form";
import { getEntry, getLastFxRate, listCategories } from "@/lib/dal/finance";
import { listUnits } from "@/lib/dal/units";
import { todayInLima } from "@/lib/domain/finance-view";
import { updateEntryAction } from "../actions";
import { getFinanceContext } from "../_lib/context";

function centsToText(cents: number) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export default async function EditFinancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const ctx = await getFinanceContext();
  if (!ctx) notFound();

  // RLS: a staff member only gets their own entries here; anything else is null.
  const entry = await getEntry(ctx.supabase, ctx.orgId, id);
  if (!entry) notFound();
  const [categories, units, usd] = await Promise.all([
    listCategories(ctx.supabase, ctx.orgId),
    listUnits(ctx.supabase, ctx.orgId),
    getLastFxRate(ctx.supabase, ctx.orgId, "USD"),
  ]);

  const initial: Record<string, string> = {
    occurredOn: entry.occurredOn,
    amount: centsToText(entry.amountCents),
    currency: entry.currency,
    fxRate: entry.fxRatePen === null ? "" : String(entry.fxRatePen),
    categoryId: entry.categoryId,
    unitId: entry.unitId ?? "",
    paymentMethod: entry.paymentMethod ?? "",
    counterparty: entry.counterparty ?? "",
    note: entry.note ?? "",
  };
  const stayInfo = entry.stayStart && entry.stayEnd ? `Estadía del ${entry.stayStart} al ${entry.stayEnd}. Las fechas de la estadía no se editan aquí.` : undefined;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/app/finance" className="text-sm text-muted-foreground hover:text-foreground">← Volver a Finanzas</Link>
      <Card>
        <CardHeader><CardTitle>Editar movimiento</CardTitle></CardHeader>
        <CardContent>
          <FinanceForm
            mode="edit"
            action={updateEntryAction}
            entryId={entry.id}
            entryKind={entry.kind}
            hasReceipt={entry.hasReceipt}
            stayInfo={stayInfo}
            units={units.map((u) => ({ id: u.id, name: u.name }))}
            categories={categories.filter((c) => c.kind === entry.kind && (!c.archived || c.id === entry.categoryId)).map((c) => ({ id: c.id, name: c.name }))}
            today={todayInLima(new Date())}
            lastFxRate={usd === null ? "" : String(usd)}
            propertyCurrency={null}
            cleaningByUnit={{}}
            initial={initial}
          />
        </CardContent>
      </Card>
    </div>
  );
}
