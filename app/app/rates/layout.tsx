import Link from "next/link";
import { verifySession } from "@/lib/dal/session";

export default async function RatesLayout({ children }: { children: React.ReactNode }) {
  await verifySession();
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-semibold">Tarifas y temporadas</h1><p className="text-sm text-muted-foreground">Configura precios por unidad y prueba el total de una estancia.</p></div>
    <nav aria-label="Tarifas" className="flex flex-wrap gap-4 border-b pb-3 text-sm">
      <Link className="underline underline-offset-4" href="/app/rates">Tarifas por unidad</Link>
      <Link className="underline underline-offset-4" href="/app/rates/seasons">Temporadas</Link>
      <Link className="underline underline-offset-4" href="/app/rates/fees">Cargos</Link>
      <Link className="underline underline-offset-4" href="/app/rates/simulator">Simulador</Link>
    </nav>{children}
  </div>;
}
