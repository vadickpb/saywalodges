import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FinanceForm, type FinanceFormMode } from "@/components/dashboard/finance-form";
import { getCleaningDefaults, getLastFxRate, listCategories } from "@/lib/dal/finance";
import { listUnits } from "@/lib/dal/units";
import { todayInLima } from "@/lib/domain/finance-view";
import { createEntryAction, createRentalAction } from "../actions";
import { getFinanceContext } from "../_lib/context";

const TITLES: Record<string, string> = { rental: "Registrar alquiler", income: "Registrar ingreso", expense: "Registrar egreso" };

export default async function NewFinancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await getFinanceContext();
  if (!ctx) return <Card><CardContent className="pt-6 text-sm text-muted-foreground">No tienes una organización activa.</CardContent></Card>;

  const raw = (await searchParams).type;
  const type = (Array.isArray(raw) ? raw[0] : raw) ?? "expense";
  const mode: FinanceFormMode = type === "rental" || type === "income" ? type : "expense";

  const [categories, allUnits, usd, cleaning] = await Promise.all([
    listCategories(ctx.supabase, ctx.orgId),
    listUnits(ctx.supabase, ctx.orgId),
    getLastFxRate(ctx.supabase, ctx.orgId, "USD"),
    getCleaningDefaults(ctx.supabase, ctx.orgId),
  ]);
  const kind = mode === "expense" ? "expense" : "income";
  const units = allUnits.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name }));

  return (
    <div className="flex flex-col gap-4">
      <Link href="/app/finance" className="text-sm text-muted-foreground hover:text-foreground">← Volver a Finanzas</Link>
      <Card>
        <CardHeader><CardTitle>{TITLES[mode]}</CardTitle></CardHeader>
        <CardContent>
          <FinanceForm
            mode={mode}
            action={mode === "rental" ? createRentalAction : createEntryAction}
            units={units}
            categories={categories.filter((c) => c.kind === kind && !c.archived).map((c) => ({ id: c.id, name: c.name }))}
            today={todayInLima(new Date())}
            lastFxRate={usd === null ? "" : String(usd)}
            propertyCurrency={cleaning.currency}
            cleaningByUnit={cleaning.byUnit}
          />
        </CardContent>
      </Card>
    </div>
  );
}
