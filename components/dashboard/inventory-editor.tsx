"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  copyInventoryAction,
  quickAddInventoryAction,
  saveInventoryCostAction,
  saveInventoryItemAction,
  setInventoryVisibilityAction,
  deleteInventoryItemAction,
  moveInventoryItemAction,
  type InventoryActionResult,
} from "@/app/app/site/inventory/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RowAction } from "@/components/dashboard/row-action";
import { Textarea } from "@/components/ui/textarea";
import type { InventoryText } from "@/dictionaries/inventory";
import { INVENTORY_CATEGORIES, formatReplacementAmount, type InventoryAnchor } from "@/lib/domain/inventory";
import type { InventoryEditorData, InventoryItem, InventoryLocation } from "@/lib/dal/inventory";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function anchorKey(anchor: InventoryAnchor): string {
  return anchor.kind === "property" ? "property" : `${anchor.kind}:${anchor.id}`;
}

function locationLabel(location: InventoryLocation, text: InventoryText): { name: string; detail: string } {
  if (location.anchor.kind === "property") return { name: text.propertyWide, detail: text.reviewReassign };
  if (location.anchor.kind === "unit") return { name: location.name, detail: text.unitWhole };
  const scope = location.common ? text.commonArea : (location.unitName ?? text.space);
  return { name: location.name, detail: location.nameEn ? `${scope} · ${location.nameEn}` : scope };
}

function ActionStatus({ result, text }: { result: InventoryActionResult | null; text: InventoryText }) {
  if (!result) return null;
  return <p role="status" aria-live="polite" className={`text-sm ${result.ok ? "text-muted-foreground" : "text-destructive"}`}>
    {result.ok ? (result.count === undefined ? text.saved : text.savedCount.replace("{count}", String(result.count))) : result.error}
  </p>;
}

function useInventoryAction(text: InventoryText, onSuccess?: () => void) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<InventoryActionResult | null>(null);
  const router = useRouter();
  const run = (action: (formData: FormData) => Promise<InventoryActionResult>, formData: FormData) => {
    startTransition(async () => {
      try {
        const next = await action(formData);
        setResult(next);
        if (next.ok) {
          onSuccess?.();
          router.refresh();
        }
      } catch {
        setResult({ ok: false, error: text.offline });
      }
    });
  };
  return { pending, result, run };
}

function LocationOptions({ locations, text }: { locations: InventoryLocation[]; text: InventoryText }) {
  return locations.filter((location) => location.anchor.kind !== "property").map((location) => (
    <option key={location.key} value={location.key}>{locationLabel(location, text).name} — {locationLabel(location, text).detail}</option>
  ));
}

function FieldError({ result, name }: { result: InventoryActionResult | null; name: string }) {
  if (!result || result.ok) return null;
  const message = result.fields?.[name]?.join(" ");
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

function ItemForm({
  item,
  locations,
  selectedLocation,
  text,
  onDone,
}: {
  item?: InventoryItem;
  locations: InventoryLocation[];
  selectedLocation: string;
  text: InventoryText;
  onDone: () => void;
}) {
  const { pending, result, run } = useInventoryAction(text, onDone);
  const initialLocation = item?.anchor.kind === "property" ? "" : item ? anchorKey(item.anchor) : selectedLocation;
  return (
    <form className="space-y-4 rounded-lg border bg-muted/20 p-4" onSubmit={(event) => {
      event.preventDefault();
      run(saveInventoryItemAction, new FormData(event.currentTarget));
    }}>
      {item && <input type="hidden" name="id" value={item.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${item?.id ?? "new"}-location`}>{text.chooseLocation}</Label>
          <select id={`${item?.id ?? "new"}-location`} name="location" className={selectClass} defaultValue={initialLocation} required>
            <option value="" disabled>{text.chooseLocation}</option>
            <LocationOptions locations={locations} text={text} />
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${item?.id ?? "new"}-name-es`}>{text.nameEs}</Label>
          <Input id={`${item?.id ?? "new"}-name-es`} name="nameEs" defaultValue={item?.nameEs ?? ""} maxLength={120} required />
          <FieldError result={result} name="nameEs" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${item?.id ?? "new"}-name-en`}>{text.nameEn}</Label>
          <Input id={`${item?.id ?? "new"}-name-en`} name="nameEn" defaultValue={item?.nameEn ?? ""} maxLength={120} />
          <FieldError result={result} name="nameEn" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${item?.id ?? "new"}-quantity`}>{text.quantity}</Label>
          <Input id={`${item?.id ?? "new"}-quantity`} name="quantity" type="number" min={0} max={9999} defaultValue={item?.quantity ?? 1} required />
          <FieldError result={result} name="quantity" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${item?.id ?? "new"}-category`}>{text.category}</Label>
          <select id={`${item?.id ?? "new"}-category`} name="category" className={selectClass} defaultValue={item?.category ?? "other"}>
            {INVENTORY_CATEGORIES.map((category) => <option key={category} value={category}>{text.categoryLabels[category]}</option>)}
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${item?.id ?? "new"}-note`}>{text.note}</Label>
          <Textarea id={`${item?.id ?? "new"}-note`} name="note" defaultValue={item?.note ?? ""} maxLength={500} rows={2} />
          <FieldError result={result} name="note" />
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" name="consumable" defaultChecked={item?.consumable ?? false} /> {text.consumable}</label>
        <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" name="guestVisible" defaultChecked={item?.guestVisible ?? true} /> {text.guestVisible}</label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>{pending ? text.saving : text.save}</Button>
        <Button type="button" variant="outline" onClick={onDone}>{text.cancel}</Button>
        <ActionStatus result={result} text={text} />
      </div>
    </form>
  );
}

function CostForm({ itemId, cents, currency, text }: { itemId: string; cents: number | null; currency: "PEN" | "USD"; text: InventoryText }) {
  const { pending, result, run } = useInventoryAction(text);
  return (
    <form className="mt-3 grid gap-2 rounded-md border border-dashed p-3 sm:grid-cols-[1fr_7rem_auto] sm:items-end" onSubmit={(event) => {
      event.preventDefault();
      run(saveInventoryCostAction, new FormData(event.currentTarget));
    }}>
      <input type="hidden" name="id" value={itemId} />
      <div className="space-y-1.5">
        <Label htmlFor={`${itemId}-amount`}>{text.cost}</Label>
        <Input id={`${itemId}-amount`} name="amount" inputMode="decimal" defaultValue={formatReplacementAmount(cents)} placeholder="0.00" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${itemId}-currency`}>{text.amount}</Label>
        <select id={`${itemId}-currency`} name="currency" className={selectClass} defaultValue={currency}>
          <option value="PEN">PEN</option><option value="USD">USD</option>
        </select>
      </div>
      <Button type="submit" size="sm" disabled={pending}>{pending ? text.saving : text.save}</Button>
      <div className="sm:col-span-3"><p className="text-xs text-muted-foreground">{text.clearCostHelp}</p><ActionStatus result={result} text={text} /></div>
    </form>
  );
}

function QuickTools({ selected, locations, text }: { selected: InventoryLocation; locations: InventoryLocation[]; text: InventoryText }) {
  const quickForm = useRef<HTMLFormElement>(null);
  const copyForm = useRef<HTMLFormElement>(null);
  const quick = useInventoryAction(text, () => quickForm.current?.reset());
  const copy = useInventoryAction(text, () => copyForm.current?.reset());
  const targets = locations.filter((location) => location.anchor.kind !== "property" && location.key !== selected.key);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card className="gap-3 py-4">
        <CardHeader className="px-4"><CardTitle className="text-base">{text.quickAdd}</CardTitle></CardHeader>
        <CardContent className="px-4">
          <form ref={quickForm} className="space-y-3" onSubmit={(event) => {
            event.preventDefault();
            quick.run(quickAddInventoryAction, new FormData(event.currentTarget));
          }}>
            <input type="hidden" name="location" value={selected.key} />
            <p className="text-sm text-muted-foreground">{text.quickHelp}</p>
            <Textarea name="items" rows={5} maxLength={20_000} placeholder={text.quickPlaceholder} required />
            <div className="flex flex-wrap items-center gap-2"><Button type="submit" size="sm" disabled={quick.pending}>{quick.pending ? text.saving : text.addLines}</Button><ActionStatus result={quick.result} text={text} /></div>
          </form>
        </CardContent>
      </Card>
      <Card className="gap-3 py-4">
        <CardHeader className="px-4"><CardTitle className="text-base">{text.copy}</CardTitle></CardHeader>
        <CardContent className="px-4">
          <form ref={copyForm} className="space-y-3" onSubmit={(event) => {
            event.preventDefault();
            copy.run(copyInventoryAction, new FormData(event.currentTarget));
          }}>
            <input type="hidden" name="source" value={selected.key} />
            <p className="text-sm text-muted-foreground">{text.copyHelp}</p>
            <div className="space-y-1.5"><Label htmlFor="copy-target">{text.copyTo}</Label>
              <select id="copy-target" name="target" className={selectClass} defaultValue="" required disabled={targets.length === 0}>
                <option value="" disabled>{text.chooseLocation}</option><LocationOptions locations={targets} text={text} />
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2"><Button type="submit" size="sm" disabled={copy.pending || targets.length === 0}>{copy.pending ? text.saving : text.copySubmit}</Button><ActionStatus result={copy.result} text={text} /></div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function InventoryEditor({ data, text }: { data: InventoryEditorData; text: InventoryText }) {
  const [selectedKey, setSelectedKey] = useState(data.locations[0]?.key ?? "");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const selected = data.locations.find((location) => location.key === selectedKey) ?? data.locations[0];
  const items = selected ? data.items.filter((item) => anchorKey(item.anchor) === selected.key) : [];
  const ownerCosts = useMemo(() => data.role === "owner"
    ? new Map(data.items.map((item) => [item.id, { cents: item.replacementCents, currency: item.currency }]))
    : null, [data]);

  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-semibold text-foreground">{text.title}</h1><p className="mt-1 text-sm text-muted-foreground">{text.intro}</p></div>
      {data.locations.length === 0 ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">{text.setupFirst}</CardContent></Card>
      ) : selected ? (
        <>
          <div className="space-y-1.5"><Label htmlFor="inventory-location">{text.chooseLocation}</Label>
            <select id="inventory-location" className={selectClass} value={selected.key} onChange={(event) => { setSelectedKey(event.target.value); setAdding(false); setEditingId(null); }}>
              {data.locations.map((location) => <option key={location.key} value={location.key}>{locationLabel(location, text).name} — {locationLabel(location, text).detail}</option>)}
            </select>
          </div>
          {selected.anchor.kind !== "property" && <QuickTools selected={selected} locations={data.locations} text={text} />}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="font-semibold">{locationLabel(selected, text).name}</h2><p className="text-sm text-muted-foreground">{locationLabel(selected, text).detail}</p></div>
            {selected.anchor.kind !== "property" && <Button type="button" size="sm" onClick={() => setAdding(true)}>{text.add}</Button>}
          </div>
          {adding && <ItemForm locations={data.locations} selectedLocation={selected.key} text={text} onDone={() => setAdding(false)} />}
          {items.length === 0 ? (
            <Card><CardContent className="pt-6 text-sm text-muted-foreground">{text.empty}</CardContent></Card>
          ) : (
            <ul className="space-y-3">
              {items.map((item, index) => {
                const cost = ownerCosts?.get(item.id);
                return <li key={item.id}>
                  <Card className="gap-3 py-4">
                    <CardContent className="px-4">
                      {editingId === item.id ? <ItemForm item={item} locations={data.locations} selectedLocation={selected.key} text={text} onDone={() => setEditingId(null)} /> : <>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="break-words font-medium"><span className="mr-2 tabular-nums text-muted-foreground">{item.quantity}×</span>{item.nameEs}</p>
                            {item.nameEn && <p className="break-words text-sm text-muted-foreground">{item.nameEn}</p>}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Badge variant="secondary">{text.categoryLabels[item.category]}</Badge>
                              {item.consumable && <Badge variant="outline">{text.consumable}</Badge>}
                              <Badge variant={item.guestVisible ? "outline" : "destructive"}>{item.guestVisible ? text.visible : text.hidden}</Badge>
                            </div>
                            {item.note && <p className="mt-2 whitespace-pre-wrap break-words text-sm"><span className="text-muted-foreground">{text.note}: </span>{item.note}</p>}
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-1.5">
                            <RowAction action={moveInventoryItemAction} fields={{ id: item.id, direction: "up" }} label="↑" ariaLabel={`${text.moveUp}: ${item.nameEs}`} disabled={index === 0} />
                            <RowAction action={moveInventoryItemAction} fields={{ id: item.id, direction: "down" }} label="↓" ariaLabel={`${text.moveDown}: ${item.nameEs}`} disabled={index === items.length - 1} />
                            <RowAction action={setInventoryVisibilityAction} fields={{ id: item.id, visible: String(!item.guestVisible) }} label={item.guestVisible ? text.hideAction : text.showAction} ariaLabel={`${item.guestVisible ? text.hideAction : text.showAction}: ${item.nameEs}`} />
                            <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(item.id)}>{text.edit}</Button>
                            <RowAction action={deleteInventoryItemAction} fields={{ id: item.id }} label={text.delete} ariaLabel={`${text.delete}: ${item.nameEs}`} variant="destructive" confirm={{ title: text.deleteTitle, description: text.deleteDescription, confirmLabel: text.delete }} />
                          </div>
                        </div>
                        {cost && <CostForm itemId={item.id} cents={cost.cents} currency={cost.currency} text={text} />}
                      </>}
                    </CardContent>
                  </Card>
                </li>;
              })}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
