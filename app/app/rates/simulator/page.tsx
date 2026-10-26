import Link from "next/link";
import { getPricingData } from "@/lib/dal/rates";
import { PricingSimulator } from "./simulator";
export default async function SimulatorPage() {
  const data = await getPricingData();
  if (!data) return <p>No tienes una propiedad activa.</p>;
  if (!data.units.length) return <Link className="underline" href="/app/site/units">Primero crea una unidad</Link>;
  return <PricingSimulator key={data.units.map((u) => u.id).join(",")} units={data.units.map((u) => ({ id: u.id, name: u.name, active: u.active }))} />;
}
