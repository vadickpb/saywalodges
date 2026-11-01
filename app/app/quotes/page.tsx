import Link from "next/link";
import { getPricingData } from "@/lib/dal/rates";
import { listOpenQuotes } from "@/lib/dal/quotes";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { limaDate, quoteLinkUrl } from "@/lib/domain/quote-builder";
import { formatPrice } from "@/lib/domain/rates-management";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CopyButton } from "./copy-button";
import { QuoteForm } from "./quote-form";

export default async function QuotesPage() {
  await requireActiveOrg();
  const [data, open] = await Promise.all([getPricingData(), listOpenQuotes()]);
  const units = data?.units.filter((u) => u.active) ?? [];
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Cotizar</CardTitle></CardHeader>
        <CardContent>
          {units.length
            ? <QuoteForm units={units.map((u) => ({ id: u.id, name: u.name }))} />
            : <Link className="text-sm underline" href="/app/site/units">Primero crea y activa una unidad</Link>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Cotizaciones abiertas</CardTitle></CardHeader>
        <CardContent>
          {open.quotes.length === 0 ? <p className="text-sm text-muted-foreground">No hay cotizaciones abiertas.</p> : (
            <ul className="divide-y text-sm">
              {open.quotes.map((q) => (
                <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{q.unitName} · {q.checkIn} → {q.checkOut} · {q.guests} huésped(es)</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span>{formatPrice(q.totalCents, q.currency)} · vence {limaDate(q.expiresAt)}</span>
                    {open.origin && <CopyButton size="sm" text={quoteLinkUrl(open.origin, "es", q.token)} label="Copiar enlace"
                      ariaLabel={`Copiar enlace de ${q.unitName}, ${q.checkIn} a ${q.checkOut}`} />}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
