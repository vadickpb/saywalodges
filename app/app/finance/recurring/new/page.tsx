import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecurringForm } from "@/components/dashboard/recurring-form";
import { listCategories } from "@/lib/dal/finance";
import { listUnits } from "@/lib/dal/units";
import { getFinanceContext } from "../../_lib/context";
import { createTemplateAction } from "../actions";

export default async function NewRecurringPage() {
  const ctx = await getFinanceContext();
  if (!ctx || !ctx.isOwner) notFound();
  const [categories, units] = await Promise.all([listCategories(ctx.supabase, ctx.orgId), listUnits(ctx.supabase, ctx.orgId)]);
  return (
    <div className="flex flex-col gap-4">
      <Link href="/app/finance/recurring" className="text-sm text-muted-foreground hover:text-foreground">← Volver a gastos recurrentes</Link>
      <Card>
        <CardHeader><CardTitle>Nuevo gasto recurrente</CardTitle></CardHeader>
        <CardContent>
          <RecurringForm
            action={createTemplateAction}
            categories={categories.filter((c) => c.kind === "expense" && !c.archived).map((c) => ({ id: c.id, name: c.name }))}
            units={units.map((u) => ({ id: u.id, name: u.name }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
