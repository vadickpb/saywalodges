import { z } from "zod";

export const INVENTORY_CATEGORIES = [
  "kitchen", "bedding", "bath", "appliances", "furniture", "decor", "outdoor", "games", "safety", "other",
] as const;

export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];
export type InventoryAnchor =
  | { kind: "unit"; id: string }
  | { kind: "space"; id: string }
  | { kind: "property" };

const nameSchema = z.string().trim().min(1).max(120);

export const inventoryItemInputSchema = z.object({
  nameEs: nameSchema,
  nameEn: z.string().trim().max(120),
  quantity: z.number().int().min(0).max(9999),
  category: z.enum(INVENTORY_CATEGORIES),
  consumable: z.boolean(),
  guestVisible: z.boolean(),
  note: z.string().trim().max(500),
});

export type InventoryItemInput = z.infer<typeof inventoryItemInputSchema>;

export type QuickInventoryItem = { name: string; quantity: number };
export type QuickInventoryIssue = { line: number; message: "invalid_quantity" | "missing_name" | "name_too_long" };
export type QuickInventoryResult =
  | { ok: true; items: QuickInventoryItem[] }
  | { ok: false; issues: QuickInventoryIssue[] };

/** Parse one Spanish item per line. A leading integer is the quantity; otherwise it defaults to one. */
export function parseQuickInventory(value: string): QuickInventoryResult {
  const lines = value.split(/\r?\n/);
  const items: QuickInventoryItem[] = [];
  const issues: QuickInventoryIssue[] = [];

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const numbered = /^(\d+)\s+(.+)$/.exec(line);
    const quantity = numbered ? Number(numbered[1]) : 1;
    const name = (numbered?.[2] ?? line).trim();
    if (!Number.isSafeInteger(quantity) || quantity > 9999) {
      issues.push({ line: index + 1, message: "invalid_quantity" });
    } else if (!name) {
      issues.push({ line: index + 1, message: "missing_name" });
    } else if (name.length > 120) {
      issues.push({ line: index + 1, message: "name_too_long" });
    } else {
      items.push({ name, quantity });
    }
  });

  return issues.length > 0 ? { ok: false, issues } : { ok: true, items };
}

export function parseReplacementCents(value: string): number | null | undefined {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(normalized)) return undefined;
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return cents <= 100_000_000 ? cents : undefined;
}

export function formatReplacementAmount(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}
