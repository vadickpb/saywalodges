"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { whatsappRuleAction } from "@/app/app/settings/whatsapp/actions";
import { whatsappRuleLabels, type WhatsappRule } from "@/lib/domain/whatsapp-rules";
import type { FormState } from "@/app/app/site/_lib/form-state";

function RuleForm({ rule }: { rule: WhatsappRule }) {
  const [state, action, pending] = useActionState<FormState, FormData>(whatsappRuleAction, { ok: false });
  const text = whatsappRuleLabels[rule.kind];
  const errors = state.errors ?? {};
  const id = `rule-${rule.kind}`;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{text.title}</CardTitle></CardHeader>
      <CardContent>
        <form action={action} className="space-y-3">
          <input type="hidden" name="kind" value={rule.kind} />
          <p className="text-sm text-muted-foreground">{text.help}</p>
          <label className="flex items-center gap-2 text-sm" htmlFor={`${id}-enabled`}>
            <input id={`${id}-enabled`} name="enabled" type="checkbox" defaultChecked={rule.enabled} className="size-4" /> Enviar este mensaje
          </label>
          {text.offset && (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-offset`}>{text.offset}</Label>
              <Input id={`${id}-offset`} name="offsetDays" type="number" min={0} max={rule.kind === "post_stay" ? 3 : 14} defaultValue={rule.offsetDays} aria-invalid={Boolean(errors.offsetDays)} aria-describedby={errors.offsetDays ? `${id}-offset-error` : undefined} />
              {errors.offsetDays && <p id={`${id}-offset-error`} className="text-sm text-destructive">{errors.offsetDays.join(" ")}</p>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-start`}>Desde (hora de Lima)</Label>
              <Input id={`${id}-start`} name="windowStart" type="number" min={0} max={23} defaultValue={rule.windowStart} aria-invalid={Boolean(errors.windowStart)} aria-describedby={errors.windowStart ? `${id}-start-error` : undefined} />
              {errors.windowStart && <p id={`${id}-start-error`} className="text-sm text-destructive">{errors.windowStart.join(" ")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-end`}>Hasta (hora de Lima)</Label>
              <Input id={`${id}-end`} name="windowEnd" type="number" min={1} max={24} defaultValue={rule.windowEnd} aria-invalid={Boolean(errors.windowEnd)} aria-describedby={errors.windowEnd ? `${id}-end-error` : undefined} />
              {errors.windowEnd && <p id={`${id}-end-error`} className="text-sm text-destructive">{errors.windowEnd.join(" ")}</p>}
            </div>
          </div>
          {state.formError && <p role="alert" className="text-sm text-destructive">{state.formError}</p>}
          {state.ok && <p role="status" className="text-sm text-muted-foreground">Guardado.</p>}
          <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function WhatsappRules({ rules }: { rules: WhatsappRule[] }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Mensajes de WhatsApp</h1>
      <p className="text-sm text-muted-foreground">
        Solo se escribe a huéspedes que marcaron la casilla de WhatsApp al reservar. Los mensajes se envían dentro del horario que elijas (hora de Lima);
        si una regla está apagada, no sale ningún mensaje de ese tipo.
      </p>
      <div className="grid gap-4 md:grid-cols-2">{rules.map((rule) => <RuleForm key={rule.kind} rule={rule} />)}</div>
    </div>
  );
}
