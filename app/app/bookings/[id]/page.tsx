import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getBookingDetail, getBookingsContext } from "@/lib/dal/bookings";
import { PAYMENT_STATUS_LABEL, METHOD_LABEL, bookingStateLabel, canCancel, canReview } from "@/lib/domain/bookings";
import { nightsBetween, showDate, showStamp } from "@/lib/domain/booking-format";
import { formatPrice } from "@/lib/domain/rates-management";
import { BookingBadge } from "@/components/dashboard/booking-badge";
import { CancelBooking, ReviewPayment } from "@/components/dashboard/booking-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const ctx = await getBookingsContext();
  if (!ctx) notFound();
  const b = await getBookingDetail(ctx, id);
  if (!b) notFound();

  const state = bookingStateLabel(b.status, b.hasVoucherToReview);
  const nights = nightsBetween(b.checkIn, b.checkOut);
  // The ledger is kept in soles: a payment in another currency needs an exchange rate (ADR 0007).
  const foreign = b.currency === "PEN" ? null : b.currency;

  return (
    <div className="space-y-4">
      <Link href="/app/bookings" className="text-sm underline">← Volver a las reservas</Link>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>{b.guest.name}</CardTitle>
          <BookingBadge label={state.label} tone={state.tone} />
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
            <dt className="text-muted-foreground">Alojamiento</dt><dd>{b.unitName}</dd>
            <dt className="text-muted-foreground">Estadía</dt><dd>{showDate(b.checkIn)} → {showDate(b.checkOut)} ({nights} {nights === 1 ? "noche" : "noches"}) · {b.guests} {b.guests === 1 ? "huésped" : "huéspedes"}</dd>
            <dt className="text-muted-foreground">Total</dt><dd>{formatPrice(b.totalCents, b.currency)}</dd>
            <dt className="text-muted-foreground">Adelanto</dt><dd>{formatPrice(b.depositCents, b.currency)}</dd>
            <dt className="text-muted-foreground">Creada</dt><dd>{showStamp(b.createdAt)}</dd>
            {b.status === "pending_payment" && b.expiresAt && (<><dt className="text-muted-foreground">Retiene fechas hasta</dt><dd>{showStamp(b.expiresAt)}</dd></>)}
            {b.confirmedAt && (<><dt className="text-muted-foreground">Confirmada</dt><dd>{showStamp(b.confirmedAt)}</dd></>)}
            {b.cancelledAt && (<><dt className="text-muted-foreground">Cancelada</dt><dd>{showStamp(b.cancelledAt)}{b.cancelReason ? <> · <bdi>{b.cancelReason}</bdi></> : null}</dd></>)}
          </dl>
          <div>
            <h3 className="font-medium">Huésped</h3>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
              <dt className="text-muted-foreground">Correo</dt><dd>{b.guest.email}</dd>
              <dt className="text-muted-foreground">Celular</dt><dd>{b.guest.phone ?? "—"}</dd>
            </dl>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pagos</CardTitle></CardHeader>
        <CardContent>
          {b.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">El huésped aún no registró ningún pago.</p>
          ) : (
            <ul className="space-y-4">
              {b.payments.map((p) => (
                <li key={p.id} className="text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{formatPrice(p.amountCents, p.currency)} · {METHOD_LABEL[p.method] ?? p.method}</span>
                    <span>{PAYMENT_STATUS_LABEL[p.status]}</span>
                  </div>
                  <p className="text-muted-foreground">
                    Registrado {showStamp(p.createdAt)}{p.reference ? <> · Operación: <bdi>{p.reference}</bdi></> : null}{p.reviewedAt ? ` · Revisado ${showStamp(p.reviewedAt)}` : ""}
                  </p>
                  {p.rejectReason && <p className="text-muted-foreground">Motivo del rechazo: <bdi>{p.rejectReason}</bdi></p>}
                  {p.hasVoucher && (
                    <p className="mt-1 flex gap-4">
                      <a className="underline" href={`/app/bookings/${b.id}/voucher/${p.id}`} target="_blank" rel="noopener noreferrer">
                        Ver comprobante<span className="sr-only"> (se abre en una pestaña nueva)</span>
                      </a>
                      <a className="underline" href={`/app/bookings/${b.id}/voucher/${p.id}?descargar=1`}>Descargar<span className="sr-only"> el comprobante de {formatPrice(p.amountCents, p.currency)}</span></a>
                    </p>
                  )}
                  {canReview(b.status, p.status) && (
                    <ReviewPayment bookingId={b.id} paymentId={p.id} amountLabel={formatPrice(p.amountCents, p.currency)} foreignCurrency={foreign} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {canCancel(b.status) && <CancelBooking bookingId={b.id} confirmed={b.status === "confirmed"} />}
    </div>
  );
}
