"use client";

import { useActionState } from "react";
import { setUnitComponentsAction } from "@/app/app/site/units/actions";
import { Button } from "@/components/ui/button";

type State = { ok: true } | { ok: false; error: string };

export function CombinedUnitForm({ unitId, units, selected }: {
  unitId: string;
  units: { id: string; name: string }[];
  selected: string[];
}) {
  const [state, action, pending] = useActionState<State | null, FormData>(setUnitComponentsAction, null);
  return <form action={action} className="space-y-4">
    <input type="hidden" name="unitId" value={unitId} />
    <fieldset className="space-y-3">
      <legend className="sr-only">Unidades que componen esta unidad</legend>
      {units.length === 0 ? <p className="text-sm text-muted-foreground">No hay otras unidades activas.</p> : units.map((unit) => (
        <label key={unit.id} className="flex min-h-11 items-center gap-3 rounded-md border px-3 py-2 text-sm">
          <input type="checkbox" name="children" value={unit.id} defaultChecked={selected.includes(unit.id)} className="size-4" />
          <span>{unit.name}</span>
        </label>
      ))}
    </fieldset>
    {state && !state.ok && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    {state?.ok && <p role="status" className="text-sm">Composición guardada.</p>}
    <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar composición"}</Button>
  </form>;
}
