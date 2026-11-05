import Link from "next/link";
import { notFound } from "next/navigation";
import { getBookingsContext, listBookableUnits } from "@/lib/dal/bookings";
import { ManualBookingForm } from "@/components/dashboard/manual-booking-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NewBookingPage() {
  const ctx = await getBookingsContext();
  if (!ctx?.isOwner) notFound();
  const units = await listBookableUnits(ctx);

  return (
    <div className="space-y-4">
      <Link href="/app/bookings" className="text-sm underline">← Volver a las reservas</Link>
      <Card>
        <CardHeader><CardTitle>Nueva reserva manual</CardTitle></CardHeader>
        <CardContent>
          {units.length > 0 ? <ManualBookingForm units={units} /> : (
            <p className="text-sm text-muted-foreground">No hay unidades activas. Activa una unidad antes de crear una reserva manual.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
