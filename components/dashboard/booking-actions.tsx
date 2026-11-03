"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { approvePaymentAction, cancelBookingAction, rejectPaymentAction } from "@/app/app/bookings/actions";
import type { ActionResult } from "@/lib/dal/bookings";

type Run = (formData: FormData) => Promise<ActionResult>;

// Runs a server action behind a confirmation dialog; the error (never a database message) is a toast, success refreshes the page data.
function useConfirmedAction(action: Run, fields: () => Record<string, string>, success: string) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  function run() {
    const formData = new FormData();
    for (const [k, v] of Object.entries(fields())) formData.set(k, v);
    startTransition(async () => {
      try {
        const result = await action(formData);
        if (!result.ok) toast.error(result.error);
        else toast.success(success);
      } catch {
        // Network down or the action threw: say so instead of failing silently.
        toast.error("No se pudo completar la acción. Revisa tu conexión e inténtalo de nuevo.");
      }
    });
  }
  return { open, setOpen, pending, run };
}

export function ReviewPayment({ bookingId, paymentId, amountLabel, foreignCurrency }: {
  bookingId: string; paymentId: string; amountLabel: string; foreignCurrency: "PEN" | "USD" | null;
}) {
  const [fx, setFx] = useState("");
  const [reason, setReason] = useState("");
  const approve = useConfirmedAction(approvePaymentAction, () => ({ bookingId, paymentId, fxRate: fx }), "Pago aprobado: reserva confirmada.");
  const reject = useConfirmedAction(rejectPaymentAction, () => ({ bookingId, paymentId, reason }), "Comprobante rechazado.");
  const busy = approve.pending || reject.pending;
  return (
    <div className="mt-3 grid gap-4 rounded-lg border p-4 md:grid-cols-2" aria-busy={busy}>
      <div className="space-y-2">
        <h4 className="font-medium">Aprobar</h4>
        {foreignCurrency && (
          <div className="space-y-1">
            <label htmlFor={`fx-${paymentId}`} className="text-sm">Tipo de cambio (S/ por 1 {foreignCurrency}), opcional</label>
            <Input id={`fx-${paymentId}`} inputMode="decimal" value={fx} onChange={(e) => setFx(e.target.value)} placeholder="Ej.: 3.75" maxLength={9} />
            <p className="text-xs text-muted-foreground">Si lo dejas vacío se usa el último tipo de cambio registrado en tus finanzas.</p>
          </div>
        )}
        <Button type="button" disabled={busy} onClick={() => approve.setOpen(true)}>{approve.pending ? "Aprobando…" : "Aprobar pago"}</Button>
        <ConfirmDialog open={approve.open} onOpenChange={approve.setOpen} title="¿Aprobar este pago?"
          description={`Se confirmará la reserva y se registrará el ingreso de ${amountLabel} en tus finanzas. Verifica antes que el dinero llegó a tu cuenta.`}
          confirmLabel="Aprobar y confirmar" cancelLabel="Volver" onConfirm={approve.run} />
      </div>
      <div className="space-y-2">
        <h4 className="font-medium">Rechazar</h4>
        <label htmlFor={`reason-${paymentId}`} className="text-sm">Motivo (opcional)</label>
        <Textarea id={`reason-${paymentId}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} />
        <Button type="button" variant="outline" disabled={busy} onClick={() => reject.setOpen(true)}>{reject.pending ? "Rechazando…" : "Rechazar comprobante"}</Button>
        <ConfirmDialog open={reject.open} onOpenChange={reject.setOpen} title="¿Rechazar este comprobante?"
          description="El huésped podrá subir otro mientras la retención de fechas siga vigente."
          confirmLabel="Rechazar" cancelLabel="Volver" destructive onConfirm={reject.run} />
      </div>
    </div>
  );
}

export function CancelBooking({ bookingId, confirmed }: { bookingId: string; confirmed: boolean }) {
  const [reason, setReason] = useState("");
  const cancel = useConfirmedAction(cancelBookingAction, () => ({ bookingId, reason }), "Reserva cancelada.");
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <h3 className="font-medium">Cancelar la reserva</h3>
      <label htmlFor="cancel-reason" className="text-sm">Motivo (opcional)</label>
      <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} />
      <Button type="button" variant="outline" disabled={cancel.pending} onClick={() => cancel.setOpen(true)}>{cancel.pending ? "Cancelando…" : "Cancelar reserva"}</Button>
      <ConfirmDialog open={cancel.open} onOpenChange={cancel.setOpen} title="¿Cancelar esta reserva?"
        description={confirmed
          ? "Las fechas quedarán libres. Los pagos ya aprobados se conservan en tus finanzas: el reembolso se gestiona fuera del sistema."
          : "Las fechas quedarán libres y cualquier comprobante en revisión se rechazará."}
        confirmLabel="Cancelar reserva" cancelLabel="Volver" destructive onConfirm={cancel.run} />
    </div>
  );
}
