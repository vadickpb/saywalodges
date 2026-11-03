import { z } from "zod";

// Reject before trimming: otherwise a trailing newline would silently disappear.
const text = (min: number, max: number) => z.string()
  .refine(v => !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(v), "No uses caracteres de control ni saltos de línea.")
  .pipe(z.string().trim().min(min, `Ingresa al menos ${min} caracteres.`).max(max, `Usa como máximo ${max} caracteres.`));
const empty = z.union([z.literal(""), z.null()]).optional().transform(() => null);
const common = {
  holder_name: text(1, 200),
  currency: z.enum(["PEN", "USD"], { error: "Selecciona soles o dólares." }),
  instructions: text(0, 500).nullable().transform(v => v || null),
  active: z.boolean(),
  sort_order: z.coerce.number().int().min(-2147483648).max(2147483647),
};
const mobile = {
  ...common,
  phone: text(5, 30).refine(v => /^[0-9+() -]+$/.test(v) && /[0-9]/.test(v), "Ingresa un celular válido."),
  bank_name: empty, account_number: empty, cci: empty,
};
export const paymentAccountSchema = z.discriminatedUnion("kind", [
  z.object({ ...mobile, kind: z.literal("yape") }),
  z.object({ ...mobile, kind: z.literal("plin") }),
  z.object({ ...common, kind: z.literal("bank_account"), phone: empty,
    bank_name: text(1, 100), account_number: text(4, 40),
    cci: text(0, 80).nullable().transform(v => v ?? "").refine(v => /^[0-9 -]*$/.test(v), "El CCI solo admite dígitos, espacios y guiones.")
      .transform(v => v.replace(/[^0-9]/g, ""))
      .refine(v => v === "" || v.length === 20, "El CCI debe tener exactamente 20 dígitos.")
      .transform(v => v || null),
  }),
]);
export type PaymentAccountInput = z.infer<typeof paymentAccountSchema>;
export const paymentAccountIdSchema = z.uuid();
