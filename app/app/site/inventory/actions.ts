"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  copyInventory,
  deleteInventoryItem,
  moveInventoryItem,
  quickAddInventory,
  saveInventoryItem,
  saveInventoryItemCost,
  setInventoryItemVisibility,
} from "@/lib/dal/inventory";
import {
  inventoryItemInputSchema,
  parseQuickInventory,
  parseReplacementCents,
  type InventoryAnchor,
} from "@/lib/domain/inventory";

const PATH = "/app/site/inventory";
const GENERIC_ERROR = "No se pudo completar la acción. Intenta de nuevo.";
const idSchema = z.uuid();

export type InventoryActionResult =
  | { ok: true; count?: number }
  | { ok: false; error: string; fields?: Record<string, string[]> };

function parseAnchor(value: FormDataEntryValue | null): InventoryAnchor | null {
  if (value === "property") return { kind: "property" };
  if (typeof value !== "string") return null;
  if (value.startsWith("unit:")) {
    const id = idSchema.safeParse(value.slice(5));
    return id.success ? { kind: "unit", id: id.data } : null;
  }
  if (value.startsWith("space:")) {
    const id = idSchema.safeParse(value.slice(6));
    return id.success ? { kind: "space", id: id.data } : null;
  }
  return null;
}

function refreshInventory() {
  revalidatePath(PATH);
}

export async function saveInventoryItemAction(formData: FormData): Promise<InventoryActionResult> {
  const idValue = formData.get("id");
  const id = idValue === null || idValue === "" ? null : idSchema.safeParse(idValue);
  const anchor = parseAnchor(formData.get("location"));
  if ((id !== null && !id.success) || !anchor || anchor.kind === "property") return { ok: false, error: GENERIC_ERROR };
  const quantityValue = formData.get("quantity");
  const quantity = typeof quantityValue === "string" && /^\d{1,4}$/.test(quantityValue) ? Number(quantityValue) : null;
  const parsed = inventoryItemInputSchema.safeParse({
    nameEs: formData.get("nameEs"),
    nameEn: formData.get("nameEn"),
    quantity,
    category: formData.get("category"),
    consumable: formData.get("consumable") === "on",
    guestVisible: formData.get("guestVisible") === "on",
    note: formData.get("note"),
  });
  if (!parsed.success) return { ok: false, error: "Revisa los campos marcados.", fields: parsed.error.flatten().fieldErrors };
  const result = await saveInventoryItem(id?.data ?? null, anchor, parsed.data);
  if (!result.ok) return { ok: false, error: GENERIC_ERROR };
  refreshInventory();
  return { ok: true };
}

export async function setInventoryVisibilityAction(formData: FormData): Promise<InventoryActionResult> {
  const parsed = z.object({ id: idSchema, visible: z.enum(["true", "false"]) }).safeParse({
    id: formData.get("id"), visible: formData.get("visible"),
  });
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
  const result = await setInventoryItemVisibility(parsed.data.id, parsed.data.visible === "true");
  if (!result.ok) return { ok: false, error: GENERIC_ERROR };
  refreshInventory();
  return { ok: true };
}

export async function deleteInventoryItemAction(formData: FormData): Promise<InventoryActionResult> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: GENERIC_ERROR };
  const result = await deleteInventoryItem(id.data);
  if (!result.ok) return { ok: false, error: GENERIC_ERROR };
  refreshInventory();
  return { ok: true };
}

export async function moveInventoryItemAction(formData: FormData): Promise<InventoryActionResult> {
  const parsed = z.object({ id: idSchema, direction: z.enum(["up", "down"]) }).safeParse({
    id: formData.get("id"), direction: formData.get("direction"),
  });
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
  const result = await moveInventoryItem(parsed.data.id, parsed.data.direction);
  if (!result.ok) return { ok: false, error: GENERIC_ERROR };
  refreshInventory();
  return { ok: true };
}

export async function quickAddInventoryAction(formData: FormData): Promise<InventoryActionResult> {
  const anchor = parseAnchor(formData.get("location"));
  const text = z.string().max(20_000).safeParse(formData.get("items"));
  if (!anchor || anchor.kind === "property" || !text.success) return { ok: false, error: GENERIC_ERROR };
  const parsed = parseQuickInventory(text.data);
  if (!parsed.ok) {
    const lines = parsed.issues.slice(0, 5).map((issue) => issue.line).join(", ");
    return { ok: false, error: `Revisa ${parsed.issues.length === 1 ? "la línea" : "las líneas"} ${lines}.` };
  }
  if (parsed.items.length === 0 || parsed.items.length > 200) {
    return { ok: false, error: "Agrega entre 1 y 200 objetos por carga." };
  }
  const result = await quickAddInventory(anchor, parsed.items);
  if (!result.ok) return { ok: false, error: GENERIC_ERROR };
  refreshInventory();
  return { ok: true, count: result.count };
}

export async function copyInventoryAction(formData: FormData): Promise<InventoryActionResult> {
  const source = parseAnchor(formData.get("source"));
  const target = parseAnchor(formData.get("target"));
  if (!source || !target || source.kind === "property" || target.kind === "property") return { ok: false, error: GENERIC_ERROR };
  const result = await copyInventory(source, target);
  if (!result.ok && result.reason === "too_many") return { ok: false, error: "El origen tiene más de 500 objetos. Copia una ubicación más pequeña." };
  if (!result.ok) return { ok: false, error: "No se pudo copiar. Comprueba que el origen tenga objetos y que el destino sea diferente." };
  refreshInventory();
  return { ok: true, count: result.count };
}

export async function saveInventoryCostAction(formData: FormData): Promise<InventoryActionResult> {
  const parsed = z.object({ id: idSchema, currency: z.enum(["PEN", "USD"]), amount: z.string().max(20) }).safeParse({
    id: formData.get("id"), currency: formData.get("currency"), amount: formData.get("amount"),
  });
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
  const cents = parseReplacementCents(parsed.data.amount);
  if (cents === undefined) return { ok: false, error: "Ingresa un costo válido, con hasta dos decimales." };
  const result = await saveInventoryItemCost(parsed.data.id, cents, parsed.data.currency);
  if (!result.ok) return { ok: false, error: GENERIC_ERROR };
  refreshInventory();
  return { ok: true };
}
