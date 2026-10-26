"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatPrice, FEE_LABELS } from "@/lib/domain/rates-management";
import { simulatePricingAction, type SimulationState } from "../actions";

type Scenario = { unitId: string; checkIn: string; checkOut: string; guests: string; depositPercent: string };
export function PricingSimulator({ units }: { units: { id: string; name: string; active: boolean }[] }) {
  const [state, action, pending] = useActionState<SimulationState, FormData>(simulatePricingAction, {});
  // Also adopt server-returned form values for a progressive-enhancement POST.
  const [values, setValues] = useState<Scenario>(() => ({ unitId: state.values?.unitId ?? units[0].id, checkIn: state.values?.checkIn ?? "", checkOut: state.values?.checkOut ?? "", guests: state.values?.guests ?? "1", depositPercent: state.values?.depositPercent ?? "50" }));
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!values.checkIn || !values.checkOut || values.checkOut <= values.checkIn) return;
    const timer = setTimeout(() => { if (ref.current?.checkValidity()) ref.current.requestSubmit(); }, 450);
    return () => clearTimeout(timer);
  }, [values]);
  // A previous response must never be presented as the quote for newer inputs.
  const current = Object.entries(values).every(([key, value]) => state.values?.[key] === value);
  const quote = current ? state.quote : undefined;
  const price = (cents: number) => formatPrice(cents, quote?.currency ?? "USD");
  const update = (name: keyof Scenario, value: string) => setValues((prev) => ({ ...prev, [name]: value }));
  return <div className="space-y-6"><Card><CardHeader><CardTitle>Simulador de estancia</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="text-sm text-muted-foreground">Calcula con las tarifas y cargos guardados. El porcentaje de adelanto solo se usa en esta simulación. No verifica disponibilidad ni crea una reserva.</p>
    <form ref={ref} action={action} onReset={(event) => event.preventDefault()} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5"><Label htmlFor="quote-unit">Unidad</Label><select id="quote-unit" name="unitId" value={values.unitId} onChange={(e) => update("unitId", e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.active ? "" : " (inactiva)"}</option>)}</select></div>
      <div className="space-y-1.5"><Label htmlFor="quote-guests">Huéspedes</Label><Input id="quote-guests" name="guests" type="number" min={1} max={2147483647} step={1} required value={values.guests} onChange={(e) => update("guests", e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="quote-in">Entrada</Label><Input id="quote-in" name="checkIn" type="date" required value={values.checkIn} onChange={(e) => update("checkIn", e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="quote-out">Salida</Label><Input id="quote-out" name="checkOut" type="date" required value={values.checkOut} onChange={(e) => update("checkOut", e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="quote-deposit">Adelanto de prueba (%)</Label><Input id="quote-deposit" name="depositPercent" type="number" min={0} max={100} step={1} required value={values.depositPercent} onChange={(e) => update("depositPercent", e.target.value)} /></div>
      <Button type="submit" className="self-end justify-self-start" disabled={pending}>{pending ? "Calculando…" : "Calcular"}</Button>
    </form>
    <div aria-live="polite" aria-busy={pending}>{pending ? <p className="text-sm">Calculando…</p> : current && state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : !quote && <p className="text-sm text-muted-foreground">Completa los datos para calcular la estancia.</p>}</div>
  </CardContent></Card>
  {quote && <Card><CardHeader><CardTitle>Desglose · {quote.nightsCount} noche(s) · {quote.currency}</CardTitle></CardHeader><CardContent className="space-y-5">
    <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Precio por noche</caption><thead><tr className="border-b"><th className="p-2 text-left">Noche</th><th className="p-2 text-right">Tarifa</th><th className="p-2 text-right">Huéspedes extra</th><th className="p-2 text-right">Total</th></tr></thead><tbody>{quote.nights.map((n) => <tr key={n.date} className="border-b"><td className="p-2 whitespace-nowrap">{n.date}{n.isWeekend ? " · Vie/sáb" : ""}</td><td className="p-2 text-right whitespace-nowrap">{price(n.nightlyCents)}</td><td className="p-2 text-right whitespace-nowrap">{n.extraGuests} × {price(n.extraGuestUnitCents)}</td><td className="p-2 text-right whitespace-nowrap">{price(n.totalCents)}</td></tr>)}</tbody></table></div>
    {quote.fees.length > 0 && <ul className="space-y-2">{quote.fees.map((f) => <li key={f.id} className="flex flex-wrap justify-between gap-2 text-sm"><span>{f.name} · {FEE_LABELS[f.kind]} · {f.quantity} × {price(f.unitCents)}</span><span>{price(f.totalCents)}</span></li>)}</ul>}
    <dl className="space-y-2 border-t pt-4">{[
      ["Alojamiento", quote.accommodationCents], ["Cargos", quote.feesCents], ["Total", quote.totalCents], [`Adelanto de prueba (${quote.depositPercent} %)`, quote.depositCents], ["Saldo", quote.balanceCents],
    ].map(([label, amount]) => <div key={label} className="flex justify-between gap-3"><dt>{label}</dt><dd className="font-semibold">{price(Number(amount))}</dd></div>)}</dl>
  </CardContent></Card>}
  </div>;
}
