import { z } from "zod";
import { whatsappKinds, type WhatsappKind } from "./whatsapp-templates";

// Owner-configurable WhatsApp rules (SD-1010). Pure. The database enforces the same bounds (whatsapp_rules checks and
// set_whatsapp_rule); these are the form-side copies. Hours are America/Lima, window [start, end).

export type WhatsappRule = { kind: WhatsappKind; enabled: boolean; offsetDays: number; windowStart: number; windowEnd: number };

/** What applies when the owner has not saved a rule for a kind (mirrors private.whatsapp_effective_rule). */
export function defaultWhatsappRule(kind: WhatsappKind): WhatsappRule {
  switch (kind) {
    case "arrival_reminder": return { kind, enabled: true, offsetDays: 1, windowStart: 9, windowEnd: 20 };
    case "post_stay": return { kind, enabled: true, offsetDays: 0, windowStart: 14, windowEnd: 20 };
    default: return { kind, enabled: true, offsetDays: 0, windowStart: 0, windowEnd: 24 };
  }
}

export const whatsappRuleLabels: Record<WhatsappKind, { title: string; help: string; offset?: string }> = {
  confirmation: { title: "Confirmación de reserva", help: "Al confirmarse el pago." },
  deposit_reminder: { title: "Recordatorio del adelanto", help: "Cuando queda un tercio de la retención sin comprobante." },
  arrival_reminder: { title: "Recordatorio de llegada", help: "Antes de la llegada.", offset: "Días antes de la llegada (0-14)" },
  post_stay: { title: "Agradecimiento post-estadía", help: "Después de la salida.", offset: "Días después de la salida (0-3)" },
};

export const whatsappRuleSchema = z.object({
  kind: z.enum(whatsappKinds),
  enabled: z.boolean(),
  offsetDays: z.coerce.number().int().min(0).max(14),
  windowStart: z.coerce.number().int().min(0).max(23),
  windowEnd: z.coerce.number().int().min(1).max(24),
}).refine((r) => r.windowStart < r.windowEnd, { path: ["windowEnd"], message: "La hora final debe ser posterior a la inicial." })
  .refine((r) => r.kind !== "post_stay" || r.offsetDays <= 3, { path: ["offsetDays"], message: "Máximo 3 días después de la salida." });

export type WhatsappRuleRow = { kind: string; enabled: boolean; offset_days: number; window_start: number; window_end: number };

/** The four rules in display order: the saved row when there is one, the default otherwise. */
export function mergeWhatsappRules(rows: WhatsappRuleRow[]): WhatsappRule[] {
  return whatsappKinds.map((kind) => {
    const row = rows.find((r) => r.kind === kind);
    return row ? { kind, enabled: row.enabled, offsetDays: row.offset_days, windowStart: row.window_start, windowEnd: row.window_end } : defaultWhatsappRule(kind);
  });
}
