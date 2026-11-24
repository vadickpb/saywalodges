import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getPropertyId } from "@/lib/dal/content";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { createClient } from "@/lib/supabase/server";
import {
  INVENTORY_CATEGORIES,
  type InventoryAnchor,
  type InventoryCategory,
  type InventoryItemInput,
  type QuickInventoryItem,
} from "@/lib/domain/inventory";

type Client = SupabaseClient<Database>;
type Result<T = object> = ({ ok: true } & T) | { ok: false };
type Context = {
  supabase: Client;
  orgId: string;
  propertyId: string;
  role: "owner" | "staff";
};

export type InventoryLocation = {
  key: string;
  anchor: InventoryAnchor;
  name: string;
  nameEn: string;
  unitName: string | null;
  common: boolean;
};

export type InventoryItem = InventoryItemInput & {
  id: string;
  anchor: InventoryAnchor;
  sortOrder: number;
};

export type OwnerInventoryItem = InventoryItem & {
  replacementCents: number | null;
  currency: "PEN" | "USD";
};

export type InventoryEditorData =
  | { role: "staff"; locations: InventoryLocation[]; items: InventoryItem[] }
  | { role: "owner"; locations: InventoryLocation[]; items: OwnerInventoryItem[] };

type InventoryRow = Pick<Database["public"]["Tables"]["inventory_items"]["Row"],
  "id" | "unit_id" | "space_id" | "name_es" | "name_en" | "quantity" | "category" | "consumable" |
  "guest_visible" | "sort_order" | "note">;
type InventoryCostRow = Pick<Database["public"]["Tables"]["inventory_item_costs"]["Row"],
  "item_id" | "replacement_cents" | "currency">;
type CopyResult = { ok: true; count: number } | { ok: false; reason?: "too_many" };

const ITEM_COLUMNS = "id, unit_id, space_id, name_es, name_en, quantity, category, consumable, guest_visible, sort_order, note";
const PAGE_SIZE = 1_000;

function category(value: string): InventoryCategory {
  return INVENTORY_CATEGORIES.find((candidate) => candidate === value) ?? "other";
}

function rowAnchor(row: Pick<InventoryRow, "unit_id" | "space_id">): InventoryAnchor {
  if (row.unit_id) return { kind: "unit", id: row.unit_id };
  if (row.space_id) return { kind: "space", id: row.space_id };
  return { kind: "property" };
}

export function inventoryAnchorKey(anchor: InventoryAnchor): string {
  return anchor.kind === "property" ? "property" : `${anchor.kind}:${anchor.id}`;
}

function toItem(row: InventoryRow): InventoryItem {
  return {
    id: row.id,
    anchor: rowAnchor(row),
    nameEs: row.name_es,
    nameEn: row.name_en,
    quantity: row.quantity,
    category: category(row.category),
    consumable: row.consumable,
    guestVisible: row.guest_visible,
    sortOrder: row.sort_order,
    note: row.note,
  };
}

async function inventoryContext(): Promise<Context | null> {
  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg) return null;
  const supabase = await createClient();
  const propertyId = await getPropertyId(supabase, activeOrg.id);
  if (!propertyId) return null;
  return { supabase, orgId: activeOrg.id, propertyId, role: activeOrg.role };
}

function logFailure(operation: string, error: unknown) {
  console.error(`${operation} failed:`, error);
}

async function readInventoryRows(ctx: Context, anchor?: InventoryAnchor): Promise<InventoryRow[] | null> {
  const rows: InventoryRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = ctx.supabase.from("inventory_items").select(ITEM_COLUMNS)
      .eq("org_id", ctx.orgId).eq("property_id", ctx.propertyId);
    if (anchor?.kind === "unit") query = query.eq("unit_id", anchor.id).is("space_id", null);
    else if (anchor?.kind === "space") query = query.eq("space_id", anchor.id).is("unit_id", null);
    else if (anchor?.kind === "property") query = query.is("unit_id", null).is("space_id", null);
    const { data, error } = await query.order("sort_order").order("name_es").order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      logFailure("readInventoryRows", error);
      return null;
    }
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

async function readInventoryCosts(ctx: Context): Promise<InventoryCostRow[] | null> {
  const rows: InventoryCostRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await ctx.supabase.from("inventory_item_costs")
      .select("item_id, replacement_cents, currency").eq("org_id", ctx.orgId).order("item_id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      logFailure("readInventoryCosts", error);
      return null;
    }
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

export async function getInventoryEditorData(): Promise<InventoryEditorData | null> {
  const ctx = await inventoryContext();
  if (!ctx) return null;
  const [unitResult, spaceResult, itemRows] = await Promise.all([
    ctx.supabase.from("units").select("id, name, sort_order").eq("org_id", ctx.orgId).eq("property_id", ctx.propertyId).order("sort_order").order("name"),
    ctx.supabase.from("spaces").select("id, unit_id, label_es, label_en, sort_order").eq("org_id", ctx.orgId).eq("property_id", ctx.propertyId).order("sort_order").order("label_es"),
    readInventoryRows(ctx),
  ]);
  if (unitResult.error || spaceResult.error || itemRows === null) {
    logFailure("getInventoryEditorData", unitResult.error ?? spaceResult.error ?? "inventory rows unavailable");
    throw new Error("No se pudo cargar el inventario.");
  }

  const locations: InventoryLocation[] = [];
  for (const unit of unitResult.data) {
    locations.push({ key: `unit:${unit.id}`, anchor: { kind: "unit", id: unit.id }, name: unit.name, nameEn: "", unitName: null, common: false });
    for (const space of spaceResult.data.filter((candidate) => candidate.unit_id === unit.id)) {
      locations.push({
        key: `space:${space.id}`,
        anchor: { kind: "space", id: space.id },
        name: space.label_es,
        nameEn: space.label_en,
        unitName: unit.name,
        common: false,
      });
    }
  }
  for (const space of spaceResult.data.filter((candidate) => candidate.unit_id === null)) {
    locations.push({
      key: `space:${space.id}`,
      anchor: { kind: "space", id: space.id },
      name: space.label_es,
      nameEn: space.label_en,
      unitName: null,
      common: true,
    });
  }

  const items = itemRows.map(toItem);
  if (items.some((item) => item.anchor.kind === "property")) {
    locations.push({ key: "property", anchor: { kind: "property" }, name: "", nameEn: "", unitName: null, common: true });
  }
  if (ctx.role === "staff") return { role: "staff", locations, items };

  const costRows = await readInventoryCosts(ctx);
  if (costRows === null) {
    throw new Error("No se pudo cargar el inventario.");
  }
  const costs = new Map(costRows.map((cost) => [cost.item_id, cost]));
  return {
    role: "owner",
    locations,
    items: items.map((item) => {
      const cost = costs.get(item.id);
      return {
        ...item,
        replacementCents: cost?.replacement_cents ?? null,
        currency: cost?.currency === "USD" ? "USD" : "PEN",
      };
    }),
  };
}

async function anchorColumns(ctx: Context, anchor: InventoryAnchor): Promise<{ unit_id: string | null; space_id: string | null } | null> {
  if (anchor.kind === "property") return { unit_id: null, space_id: null };
  if (anchor.kind === "unit") {
    const { data, error } = await ctx.supabase.from("units").select("id").eq("id", anchor.id).eq("org_id", ctx.orgId)
      .eq("property_id", ctx.propertyId).maybeSingle();
    if (error) logFailure("validate inventory unit", error);
    return data ? { unit_id: data.id, space_id: null } : null;
  }
  const { data, error } = await ctx.supabase.from("spaces").select("id").eq("id", anchor.id).eq("org_id", ctx.orgId)
    .eq("property_id", ctx.propertyId).maybeSingle();
  if (error) logFailure("validate inventory space", error);
  return data ? { unit_id: null, space_id: data.id } : null;
}

function inputColumns(input: InventoryItemInput) {
  return {
    name_es: input.nameEs,
    name_en: input.nameEn,
    quantity: input.quantity,
    category: input.category,
    consumable: input.consumable,
    guest_visible: input.guestVisible,
    note: input.note,
  };
}

async function nextSortOrder(ctx: Context, anchor: InventoryAnchor): Promise<number> {
  let query = ctx.supabase.from("inventory_items").select("sort_order").eq("org_id", ctx.orgId).eq("property_id", ctx.propertyId);
  if (anchor.kind === "unit") query = query.eq("unit_id", anchor.id).is("space_id", null);
  else if (anchor.kind === "space") query = query.eq("space_id", anchor.id).is("unit_id", null);
  else query = query.is("unit_id", null).is("space_id", null);
  const { data, error } = await query.order("sort_order", { ascending: false }).limit(1);
  if (error) logFailure("next inventory sort order", error);
  return Math.min((data?.[0]?.sort_order ?? -1) + 1, 100_000);
}

export async function saveInventoryItem(id: string | null, anchor: InventoryAnchor, input: InventoryItemInput): Promise<Result<{ id: string }>> {
  const ctx = await inventoryContext();
  if (!ctx) return { ok: false };
  const columns = await anchorColumns(ctx, anchor);
  if (!columns) return { ok: false };
  if (id === null) {
    const sortOrder = await nextSortOrder(ctx, anchor);
    const { data, error } = await ctx.supabase.from("inventory_items").insert({
      ...inputColumns(input), ...columns, sort_order: sortOrder, org_id: ctx.orgId, property_id: ctx.propertyId,
    }).select("id").single();
    if (error || !data) {
      logFailure("saveInventoryItem insert", error);
      return { ok: false };
    }
    return { ok: true, id: data.id };
  }
  const { data, error } = await ctx.supabase.from("inventory_items").update({ ...inputColumns(input), ...columns })
    .eq("id", id).eq("org_id", ctx.orgId).eq("property_id", ctx.propertyId).select("id");
  if (error || data.length !== 1) {
    logFailure("saveInventoryItem update", error ?? "expected one row");
    return { ok: false };
  }
  return { ok: true, id: data[0].id };
}

export async function setInventoryItemVisibility(id: string, guestVisible: boolean): Promise<Result> {
  const ctx = await inventoryContext();
  if (!ctx) return { ok: false };
  const { data, error } = await ctx.supabase.from("inventory_items").update({ guest_visible: guestVisible })
    .eq("id", id).eq("org_id", ctx.orgId).eq("property_id", ctx.propertyId).select("id");
  if (error || data.length !== 1) {
    logFailure("setInventoryItemVisibility", error ?? "expected one row");
    return { ok: false };
  }
  return { ok: true };
}

export async function deleteInventoryItem(id: string): Promise<Result> {
  const ctx = await inventoryContext();
  if (!ctx) return { ok: false };
  const { data, error } = await ctx.supabase.from("inventory_items").delete()
    .eq("id", id).eq("org_id", ctx.orgId).eq("property_id", ctx.propertyId).select("id");
  if (error || data.length !== 1) {
    logFailure("deleteInventoryItem", error ?? "expected one row");
    return { ok: false };
  }
  return { ok: true };
}

export async function moveInventoryItem(id: string, direction: "up" | "down"): Promise<Result> {
  const ctx = await inventoryContext();
  if (!ctx) return { ok: false };
  const selectedResult = await ctx.supabase.from("inventory_items").select("id, unit_id, space_id, sort_order")
    .eq("id", id).eq("org_id", ctx.orgId).eq("property_id", ctx.propertyId).maybeSingle();
  if (selectedResult.error || !selectedResult.data) {
    logFailure("moveInventoryItem selected", selectedResult.error ?? "item not found");
    return { ok: false };
  }
  const selected = selectedResult.data;
  const group = await readInventoryRows(ctx, rowAnchor(selected));
  if (!group) return { ok: false };
  const currentIndex = group.findIndex((row) => row.id === id);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= group.length) return { ok: true };
  const target = group[targetIndex];
  const changes = selected.sort_order === target.sort_order
    ? direction === "up"
      ? target.sort_order < 100_000
        ? [{ id: target.id, sortOrder: target.sort_order + 1 }]
        : [{ id: selected.id, sortOrder: selected.sort_order - 1 }]
      : selected.sort_order < 100_000
        ? [{ id: selected.id, sortOrder: selected.sort_order + 1 }]
        : [{ id: target.id, sortOrder: target.sort_order - 1 }]
    : [{ id: selected.id, sortOrder: target.sort_order }, { id: target.id, sortOrder: selected.sort_order }];
  const updates = await Promise.all(changes.map((change) => ctx.supabase.from("inventory_items")
    .update({ sort_order: change.sortOrder }).eq("id", change.id).eq("org_id", ctx.orgId).eq("property_id", ctx.propertyId).select("id")));
  const failed = updates.find((result) => result.error || result.data.length !== 1);
  if (failed) {
    logFailure("moveInventoryItem update", failed.error ?? "expected one row");
    return { ok: false };
  }
  return { ok: true };
}

export async function quickAddInventory(anchor: InventoryAnchor, items: QuickInventoryItem[]): Promise<Result<{ count: number }>> {
  const ctx = await inventoryContext();
  if (!ctx) return { ok: false };
  const columns = await anchorColumns(ctx, anchor);
  if (!columns || items.length === 0) return { ok: false };
  const start = await nextSortOrder(ctx, anchor);
  const rows = items.map((item, index) => ({
    ...columns,
    org_id: ctx.orgId,
    property_id: ctx.propertyId,
    name_es: item.name,
    name_en: "",
    quantity: item.quantity,
    category: "other",
    consumable: false,
    guest_visible: true,
    note: "",
    sort_order: Math.min(start + index, 100_000),
  }));
  const { data, error } = await ctx.supabase.from("inventory_items").insert(rows).select("id");
  if (error || data.length !== rows.length) {
    logFailure("quickAddInventory", error ?? "unexpected inserted row count");
    return { ok: false };
  }
  return { ok: true, count: data.length };
}

export async function copyInventory(source: InventoryAnchor, target: InventoryAnchor): Promise<CopyResult> {
  const ctx = await inventoryContext();
  if (!ctx || inventoryAnchorKey(source) === inventoryAnchorKey(target) || source.kind === "property" || target.kind === "property") {
    return { ok: false };
  }
  const [sourceColumns, targetColumns] = await Promise.all([anchorColumns(ctx, source), anchorColumns(ctx, target)]);
  if (!sourceColumns || !targetColumns) return { ok: false };
  let query = ctx.supabase.from("inventory_items").select(ITEM_COLUMNS).eq("org_id", ctx.orgId).eq("property_id", ctx.propertyId);
  query = source.kind === "unit" ? query.eq("unit_id", source.id).is("space_id", null) : query.eq("space_id", source.id).is("unit_id", null);
  const { data, error } = await query.order("sort_order").order("name_es").limit(501);
  if (error || !data || data.length === 0 || data.length > 500) {
    if (error) logFailure("copyInventory read", error);
    return data && data.length > 500 ? { ok: false, reason: "too_many" } : { ok: false };
  }
  const start = await nextSortOrder(ctx, target);
  const rows = data.map((item, index) => ({
    ...targetColumns,
    org_id: ctx.orgId,
    property_id: ctx.propertyId,
    name_es: item.name_es,
    name_en: item.name_en,
    quantity: item.quantity,
    category: item.category,
    consumable: item.consumable,
    guest_visible: item.guest_visible,
    note: item.note,
    sort_order: Math.min(start + index, 100_000),
  }));
  const insertResult = await ctx.supabase.from("inventory_items").insert(rows).select("id");
  if (insertResult.error || insertResult.data.length !== rows.length) {
    logFailure("copyInventory insert", insertResult.error ?? "unexpected inserted row count");
    return { ok: false };
  }
  return { ok: true, count: rows.length };
}

export async function saveInventoryItemCost(itemId: string, replacementCents: number | null, currency: "PEN" | "USD"): Promise<Result> {
  const ctx = await inventoryContext();
  if (!ctx || ctx.role !== "owner") return { ok: false };
  const itemResult = await ctx.supabase.from("inventory_items").select("id").eq("id", itemId).eq("org_id", ctx.orgId)
    .eq("property_id", ctx.propertyId).maybeSingle();
  if (itemResult.error || !itemResult.data) {
    logFailure("saveInventoryItemCost item", itemResult.error ?? "item not found");
    return { ok: false };
  }
  if (replacementCents === null) {
    const { error } = await ctx.supabase.from("inventory_item_costs").delete().eq("item_id", itemId).eq("org_id", ctx.orgId);
    if (error) {
      logFailure("saveInventoryItemCost delete", error);
      return { ok: false };
    }
    return { ok: true };
  }
  // Not an upsert: PostgREST would also set item_id/org_id on conflict, and only (replacement_cents, currency) are updatable.
  const existing = await ctx.supabase.from("inventory_item_costs").select("item_id").eq("item_id", itemId).eq("org_id", ctx.orgId).maybeSingle();
  if (existing.error) {
    logFailure("saveInventoryItemCost lookup", existing.error);
    return { ok: false };
  }
  const result = existing.data
    ? await ctx.supabase.from("inventory_item_costs").update({ replacement_cents: replacementCents, currency })
      .eq("item_id", itemId).eq("org_id", ctx.orgId).select("item_id")
    : await ctx.supabase.from("inventory_item_costs")
      .insert({ item_id: itemId, org_id: ctx.orgId, replacement_cents: replacementCents, currency }).select("item_id");
  if (result.error || result.data.length !== 1) {
    logFailure("saveInventoryItemCost write", result.error ?? "expected one row");
    return { ok: false };
  }
  return { ok: true };
}
