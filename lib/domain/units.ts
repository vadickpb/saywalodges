import { z } from "zod";

export const UNIT_KINDS = ["entire_place", "room"] as const;
export const UNIT_KIND_LABELS: Record<(typeof UNIT_KINDS)[number], string> = {
  entire_place: "Casa completa",
  room: "Habitación",
};

// Parse form text explicitly: coercing an empty string to 0 would hide a
// missing capacity. The same constraints are enforced for direct DB writes.
const guestCount = z.string().trim().regex(/^[0-9]+$/, "Ingresa un número entero positivo")
  .transform(Number).pipe(z.number().int().min(1, "Mínimo 1 huésped").max(2147483647, "Capacidad demasiado grande"));

export const unitInputSchema = z.object({
  name: z.string().trim().min(1, "Obligatorio").max(200, "Máximo 200 caracteres"),
  kind: z.enum(UNIT_KINDS),
  maxGuests: guestCount,
  includedGuests: guestCount,
  active: z.enum(["true", "false"]).transform((value) => value === "true"),
}).refine((value) => value.includedGuests <= value.maxGuests, {
  path: ["includedGuests"], message: "No puede superar la capacidad máxima",
});

export type UnitInput = z.infer<typeof unitInputSchema>;
