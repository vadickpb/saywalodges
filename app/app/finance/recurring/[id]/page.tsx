import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecurringForm } from "@/components/dashboard/recurring-form";
import { listCategories } from "@/lib/dal/finance";
import { getTemplate } from "@/lib/dal/finance-recurring";
import { listUnits } from "@/lib/dal/units";
import { centsToText } from "@/lib/domain/finance-recurring";
import { getFinanceContext } from "../../_lib/context";
import { updateTemplateAction } from "../actions";

export default async function EditRecurringPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const ctx = await getFinanceContext();
  if (!ctx || !ctx.isOwner) notFound();
  const template = await getTemplate(ctx.supabase, ctx.orgId, id);
  if (!template) notFound();
  const [categories, units] = await Promise.all([listCategories(ctx.supabase, ctx.orgId), listUnits(ctx.supabase, ctx.orgId)]);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/app/finance/recurring" className="text-sm text-muted-foreground hover:text-foreground">← Volver a gastos recurrentes</Link>
      <Card>
        <CardHeader><CardTitle>Editar gasto recurrente</CardTitle></CardHeader>
        <CardContent>
          <RecurringForm
            action={updateTemplateAction}
            templateId={template.id}
            categories={categories
              .filter((c) => c.kind === "expense" && (!c.archived || c.id === template.categoryId))
              .map((c) => ({ id: c.id, name: c.name }))}
            units={units.map((u) => ({ id: u.id, name: u.name }))}
            initial={{
              name: template.name,
              categoryId: template.categoryId,
              unitId: template.unitId ?? "",
              dayOfMonth: String(template.dayOfMonth),
              amount: centsToText(template.estimatedCents),
              currency: template.currency,
              counterparty: template.counterparty ?? "",
              paymentMethod: template.paymentMethod ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
