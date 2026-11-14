import { z } from "zod";

export const UNIT_KINDS = ["entire_place", "room"] as const;
export const UNIT_KIND_LABELS: Record<(typeof UNIT_KINDS)[number], string> = {
  entire_place: "Casa completa",
  room: "Habitación",
};

export const SHOWCASE_TYPES = ["house", "apartment", "villa", "room"] as const;
export type ShowcaseType = (typeof SHOWCASE_TYPES)[number];
export const SHOWCASE_TYPE_LABELS: Record<ShowcaseType, string> = {
  house: "Casa",
  apartment: "Departamento",
  villa: "Villa completa",
  room: "Habitación",
};

// Parse form text explicitly: coercing an empty string to 0 would hide a
// missing capacity. The same constraints are enforced for direct DB writes.
const guestCount = z.string().trim().regex(/^[0-9]+$/, "Ingresa un número entero positivo")
  .transform(Number).pipe(z.number().int().min(1, "Mínimo 1 huésped").max(2147483647, "Capacidad demasiado grande"));
const count = (max: number) => z.string().trim().regex(/^[0-9]+$/, "Ingresa un número entero")
  .transform(Number).pipe(z.number().int().min(0, "Mínimo 0").max(max, `Máximo ${max}`));
const description = z.string().trim().max(2000, "Máximo 2000 caracteres");
const bedDetails = z.string().trim().max(300, "Máximo 300 caracteres");

export const unitInputSchema = z.object({
  name: z.string().trim().min(1, "Obligatorio").max(200, "Máximo 200 caracteres"),
  kind: z.enum(UNIT_KINDS),
  maxGuests: guestCount,
  includedGuests: guestCount,
  active: z.enum(["true", "false"]).transform((value) => value === "true"),
  showcaseType: z.enum(SHOWCASE_TYPES),
  descriptionEs: description,
  descriptionEn: description,
  bedrooms: count(50),
  beds: count(100),
  bedDetailsEs: bedDetails,
  bedDetailsEn: bedDetails,
  bathrooms: count(50),
  sortOrder: count(2147483647),
}).refine((value) => value.includedGuests <= value.maxGuests, {
  path: ["includedGuests"], message: "No puede superar la capacidad máxima",
});

export type UnitInput = z.infer<typeof unitInputSchema>;
