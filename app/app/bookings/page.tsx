import Link from "next/link";
import { getBookingsContext, listBookings } from "@/lib/dal/bookings";
import { BOOKING_FILTERS, BOOKING_PAGE_SIZE, FILTER_LABEL, bookingStateLabel, parseBookingQuery, type BookingFilter, type BookingQuery } from "@/lib/domain/bookings";
import { nightsBetween, showDate } from "@/lib/domain/booking-format";
import { formatPrice } from "@/lib/domain/rates-management";
import { BookingBadge } from "@/components/dashboard/booking-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const href = (q: BookingQuery, patch: Partial<BookingQuery>) => {
  const next = { ...q, ...patch };
  const sp = new URLSearchParams();
  if (next.filter !== "all") sp.set("estado", next.filter);
  if (next.from) sp.set("desde", next.from);
  if (next.to) sp.set("hasta", next.to);
  if (next.page > 1) sp.set("pagina", String(next.page));
  const qs = sp.toString();
  return qs ? `/app/bookings?${qs}` : "/app/bookings";
};

export default async function BookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = parseBookingQuery(await searchParams);
  const ctx = await getBookingsContext();
  if (!ctx) return <Card><CardContent className="p-6 text-sm">No hay una organización activa.</CardContent></Card>;
  const { rows, total } = await listBookings(ctx, query);
  const pages = Math.max(1, Math.ceil(total / BOOKING_PAGE_SIZE));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Reservas</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
            {BOOKING_FILTERS.map((f: BookingFilter) => (
              <Button key={f} asChild size="sm" variant={query.filter === f ? "default" : "outline"}>
                <Link href={href(query, { filter: f, page: 1 })} aria-current={query.filter === f ? "page" : undefined}>{FILTER_LABEL[f]}</Link>
              </Button>
            ))}
          </nav>
          <form method="get" action="/app/bookings" className="flex flex-wrap items-end gap-3">
            {query.filter !== "all" && <input type="hidden" name="estado" value={query.filter} />}
            <div className="space-y-1"><label htmlFor="desde" className="text-sm">Llegada desde</label><Input id="desde" name="desde" type="date" defaultValue={query.from ?? ""} /></div>
            <div className="space-y-1"><label htmlFor="hasta" className="text-sm">Llegada hasta</label><Input id="hasta" name="hasta" type="date" defaultValue={query.to ?? ""} /></div>
            <Button type="submit" variant="outline">Aplicar</Button>
            {(query.from || query.to) && <Button asChild variant="ghost"><Link href={href(query, { from: null, to: null, page: 1 })}>Quitar fechas</Link></Button>}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No hay reservas con estos filtros.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((b) => {
                const state = bookingStateLabel(b.status, b.hasVoucherToReview);
                const nights = nightsBetween(b.checkIn, b.checkOut);
                return (
                  <li key={b.id}>
                    <Link href={`/app/bookings/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/50 focus-visible:bg-muted/50">
                      <span className="space-y-0.5">
                        <span className="block font-medium">{b.guestName}</span>
                        <span className="block text-sm text-muted-foreground">
                          {b.unitName} · {showDate(b.checkIn)} → {showDate(b.checkOut)} ({nights} {nights === 1 ? "noche" : "noches"}) · {b.guests} huésped(es)
                        </span>
                      </span>
                      <span className="flex items-center gap-3 text-sm">
                        <span>{formatPrice(b.depositCents, b.currency)} <span className="text-muted-foreground">de {formatPrice(b.totalCents, b.currency)}</span></span>
                        <BookingBadge label={state.label} tone={state.tone} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {pages > 1 && (
        <nav aria-label="Paginación" className="flex items-center justify-between text-sm">
          {query.page > 1 ? <Link className="underline" href={href(query, { page: query.page - 1 })}>← Anterior</Link> : <span />}
          <span>Página {query.page} de {pages} · {total} reservas</span>
          {query.page < pages ? <Link className="underline" href={href(query, { page: query.page + 1 })}>Siguiente →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
