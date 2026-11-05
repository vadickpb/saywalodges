"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { recordManualPaymentAction } from "@/app/app/bookings/actions";
import { MANUAL_METHODS } from "@/lib/domain/manual-booking";
import { METHOD_LABEL } from "@/lib/domain/bookings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ManualPaymentForm({ bookingId, currency }: { bookingId: string; currency: "PEN" | "USD" }) {
  const router = useRouter();
  const paymentId = useRef<string | null>(null);
  // Created on the client once per mounted form, including Strict Mode effect replay.
  useEffect(() => { paymentId.current ??= crypto.randomUUID(); }, []);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !paymentId.current) return;
    submitting.current = true;
    const data = new FormData(event.currentTarget);
    data.set("bookingId", bookingId);
    data.set("paymentId", paymentId.current);
    setError("");
    startTransition(async () => {
      try {
        const result = await recordManualPaymentAction(data);
        if (!result.ok) setError(result.error);
        else {
          setSaved(true);
          router.refresh();
          return;
        }
      } catch {
        setError("No se pudo completar la acción. Revisa tu conexión e inténtalo de nuevo.");
      }
      // Keep paymentId even after transport errors: the server may have recorded the payment.
      submitting.current = false;
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-busy={pending}>
      <p aria-live="polite" className="text-sm text-destructive">{error}</p>
      {saved && <p role="status" className="text-sm">Pago registrado.</p>}
      <fieldset disabled={pending || saved} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="manual-amount">Monto ({currency})</Label>
          <Input id="manual-amount" name="amount" inputMode="decimal" required pattern="[0-9]{1,7}([.,][0-9]{1,2})?" maxLength={10} aria-describedby="manual-amount-help" />
          <p id="manual-amount-help" className="text-xs text-muted-foreground">Usa coma o punto para los decimales, sin separadores de miles. Ej.: 150,50.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="manual-method">Método</Label>
          <select id="manual-method" name="method" required className="h-11 w-full rounded-md border bg-background px-3">
            {MANUAL_METHODS.map((method) => <option key={method} value={method}>{METHOD_LABEL[method]}</option>)}
          </select>
        </div>
        <div className="space-y-2"><Label htmlFor="manual-reference">Referencia (opcional)</Label><Input id="manual-reference" name="reference" maxLength={200} /></div>
        {currency === "USD" && (
          <div className="space-y-2">
            <Label htmlFor="manual-fx">Tipo de cambio (S/ por 1 USD)</Label>
            <Input id="manual-fx" name="fxRate" inputMode="decimal" required pattern="[0-9]{1,2}([.,][0-9]{1,4})?" maxLength={7} placeholder="Ej.: 3,75" />
          </div>
        )}
        <Button type="submit">{saved ? "Pago registrado" : pending ? "Registrando…" : "Registrar pago"}</Button>
      </fieldset>
    </form>
  );
}
