"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createManualBookingAction } from "@/app/app/bookings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ManualBookingForm({ units }: { units: { id: string; name: string; maxGuests: number }[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    const data = new FormData(event.currentTarget);
    setError("");
    startTransition(async () => {
      try {
        const result = await createManualBookingAction(data);
        if (!result.ok) setError(result.error);
        else {
          setSaved(true);
          router.push(`/app/bookings/${result.bookingId}`);
          return;
        }
      } catch {
        setError("No se pudo completar la acción. Revisa tu conexión e inténtalo de nuevo.");
      }
      submitting.current = false;
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-busy={pending}>
      <p aria-live="polite" className="text-sm text-destructive">{error}</p>
      <fieldset disabled={pending || saved} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="manual-unit">Unidad</Label>
          <select id="manual-unit" name="unitId" required className="h-11 w-full rounded-md border bg-background px-3">
            {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} · hasta {unit.maxGuests} huéspedes</option>)}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="manual-check-in">Entrada</Label><Input id="manual-check-in" name="checkIn" type="date" required /></div>
          <div className="space-y-2"><Label htmlFor="manual-check-out">Salida</Label><Input id="manual-check-out" name="checkOut" type="date" required /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="manual-guests">Huéspedes</Label><Input id="manual-guests" name="guests" type="number" min={1} max={50} step={1} defaultValue={1} required /></div>
        <div className="space-y-2"><Label htmlFor="manual-name">Nombre del huésped</Label><Input id="manual-name" name="name" autoComplete="name" maxLength={200} required /></div>
        <div className="space-y-2"><Label htmlFor="manual-email">Correo del huésped</Label><Input id="manual-email" name="email" type="email" autoComplete="email" maxLength={254} required /></div>
        <div className="space-y-2"><Label htmlFor="manual-phone">Teléfono (opcional)</Label><Input id="manual-phone" name="phone" type="tel" autoComplete="tel" maxLength={30} /></div>
        <div className="space-y-2">
          <Label htmlFor="manual-lang">Idioma del huésped</Label>
          <select id="manual-lang" name="lang" defaultValue="es" required className="h-11 w-full rounded-md border bg-background px-3">
            <option value="es">Español</option><option value="en">Inglés</option>
          </select>
        </div>
        <Button type="submit">{saved ? "Abriendo reserva…" : pending ? "Creando…" : "Crear reserva manual"}</Button>
      </fieldset>
    </form>
  );
}
