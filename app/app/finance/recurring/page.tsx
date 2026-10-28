import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RowAction } from "@/components/dashboard/row-action";
import { listCategories } from "@/lib/dal/finance";
import { listTemplates } from "@/lib/dal/finance-recurring";
import { listUnits } from "@/lib/dal/units";
import { formatPrice } from "@/lib/domain/rates-management";
import { getFinanceContext } from "../_lib/context";
import { deleteTemplateAction, toggleTemplateAction } from "./actions";

export default async function RecurringPage() {
  const ctx = await getFinanceContext();
  // Owner-only: a member who is not the owner gets a 404, like the reports.
  if (!ctx || !ctx.isOwner) notFound();
  const [templates, categories, units] = await Promise.all([
    listTemplates(ctx.supabase, ctx.orgId),
    listCategories(ctx.supabase, ctx.orgId),
    listUnits(ctx.supabase, ctx.orgId),
  ]);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const unitName = new Map(units.map((u) => [u.id, u.name]));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Gastos recurrentes</h1>
          <Link href="/app/finance" className="text-sm text-muted-foreground hover:text-foreground">← Volver a Finanzas</Link>
        </div>
        <Button asChild size="sm"><Link href="/app/finance/recurring/new">+ Nuevo gasto recurrente</Link></Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Agua, luz, internet… Cada mes aparecen como pendientes en Finanzas y los confirmas con el monto real; recién ahí se registran como egreso.
      </p>

      {templates.length === 0 ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">Todavía no hay gastos recurrentes.</CardContent></Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {templates.map((t) => (
            <li key={t.id}>
              <Card>
                <CardContent className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                        {t.name}
                        {!t.active && <Badge variant="secondary">Pausado</Badge>}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {categoryName.get(t.categoryId) ?? "Sin categoría"}
                        {` · ${t.unitId ? (unitName.get(t.unitId) ?? "Casa") : "General"}`}
                        {` · día ${t.dayOfMonth}`}
                        {t.counterparty && ` · ${t.counterparty}`}
                      </p>
                    </div>
                    <p className="text-lg font-semibold text-foreground">{formatPrice(t.estimatedCents, t.currency)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild size="sm" variant="outline"><Link href={`/app/finance/recurring/${t.id}`}>Editar</Link></Button>
                    <RowAction
                      action={toggleTemplateAction}
                      fields={{ id: t.id, active: String(!t.active) }}
                      label={t.active ? "Pausar" : "Reanudar"}
                      ariaLabel={`${t.active ? "Pausar" : "Reanudar"} ${t.name}`}
                    />
                    <RowAction
                      action={deleteTemplateAction}
                      fields={{ id: t.id }}
                      label="Eliminar"
                      ariaLabel={`Eliminar ${t.name}`}
                      variant="destructive"
                      confirm={{
                        title: "¿Eliminar este gasto recurrente?",
                        description: "Dejará de aparecer como pendiente. Los egresos que ya confirmaste se conservan.",
                      }}
                      successMessage="Gasto recurrente eliminado"
                    />
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
