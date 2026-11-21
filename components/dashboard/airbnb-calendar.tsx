"use client";

import { formatPrice } from "@/lib/domain/rates-management";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { clearPriceRangeAction, createManualBlockAction, deleteManualBlockAction, setPriceRangeAction } from "@/app/app/calendar/actions";
import type { FormState } from "@/app/app/site/_lib/form-state";
import { calendarMonth, blockStyle, type CalendarBlock } from "@/lib/domain/calendar";
import { calendarKeyboardDate, selectCalendarDate, type CalendarSelection } from "@/lib/domain/calendar-selection";
import { rangeContains } from "@/lib/domain/availability";
import { daysBetween, monthOf } from "@/lib/domain/dates";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StayDetailsCard } from "@/components/dashboard/stay-details-card";
import { firstName } from "@/lib/domain/stay-details";
import type { HouseInfo, Template } from "@/lib/domain/message-templates";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function AirbnbCalendar({ month, unit, blocks, prices = {}, currency = "PEN", library = null, today = "", secrets = null }: {
  month: string; unit: { id: string; name: string; active: boolean }; blocks: CalendarBlock[];
  prices?: Record<string, number | null>; currency?: "PEN" | "USD";
  /** SD-1130: the message library, so a stay can show its messages ready to send. Null hides that section. */
  library?: { templates: Template[]; house: HouseInfo } | null; today?: string;
  /** Wi-Fi password and door code, sent ONLY for the blocks inside their window; `configured` says whether they exist at all. */
  secrets?: { byBlock: Record<string, Pick<HouseInfo, "wifiPassword" | "doorCode">>; configured: { wifi_clave: boolean; codigo_puerta: boolean } } | null;
}) {
  const router = useRouter();
  const [navigating, navigate] = useTransition();
  const [selection, setSelection] = useState<CalendarSelection>(null);
  const [detail, setDetail] = useState<CalendarBlock | null>(null);
  const [rangeAction, setRangeAction] = useState<"block" | "price" | null>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [focused, setFocused] = useState<string | null>(null);
  const [preview, setPreview] = useState<CalendarSelection>(null);
  const grid = useRef<HTMLDivElement>(null);
  const dialogTitle = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const requestedFocus = useRef<string | null>(null);
  const drag = useRef<string | null>(null);
  const suppressClick = useRef(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const helpId = useId();
  const bounds = calendarMonth(month);
  const tabDate = focused && bounds.dates.includes(focused) ? focused : bounds.start;

  useEffect(() => {
    if (requestedFocus.current?.startsWith(`${month}-`)) {
      grid.current?.querySelector<HTMLButtonElement>(`[data-date="${requestedFocus.current}"]`)?.focus();
      requestedFocus.current = null;
    }
  }, [month]);

  useEffect(() => {
    if (open && rangeAction) dialogTitle.current?.focus();
  }, [open, rangeAction]);

  function changeMonth(target: string | null) {
    if (!target || navigating) return;
    setSelection(null);
    setMessage("");
    setPreview(null);
    drag.current = null;
    navigate(() => router.push(`/app/calendar?${new URLSearchParams({ month: target, unit: unit.id })}`, { scroll: false }));
  }

  function activate(date: string, button: HTMLButtonElement) {
    returnFocus.current = button;
    const next = selectCalendarDate(selection, date, blocks);
    if (next?.end && next !== selection) {
      setSelection(next);
      setDetail(null);
      setRangeAction(null);
      setMessage("");
      setOpen(true);
      return;
    }
    const block = blocks.find((item) => rangeContains(item, date));
    if (block) {
      setDetail(block);
      setSelection(null);
      setRangeAction(null);
      setMessage("");
      setOpen(true);
    } else {
      setSelection(next);
      setMessage(next === selection ? "Elige una salida posterior, sin noches ocupadas y de hasta 366 noches." : `Inicio: ${date}. Elige la fecha de salida.`);
    }
  }

  function close() {
    setOpen(false);
    setSelection(null);
    setDetail(null);
    setRangeAction(null);
    setPreview(null);
  }

  const highlighted = preview ?? selection;
  return <section aria-label={`Calendario de ${unit.name}`} className="min-w-0 space-y-4">
    <h3 className="font-semibold">{unit.name}{unit.active ? "" : " (inactiva)"}</h3>
    <nav aria-label="Navegación mensual" className="flex items-center justify-between gap-2">
      <Button variant="outline" className="min-h-11 min-w-11" disabled={!bounds.previous || navigating} aria-label="Mes anterior" onClick={() => changeMonth(bounds.previous)}>←</Button>
      <h2 className="font-semibold" aria-live="polite">{month}</h2>
      <Button variant="outline" className="min-h-11 min-w-11" disabled={!bounds.next || navigating} aria-label="Mes siguiente" onClick={() => changeMonth(bounds.next)}>→</Button>
    </nav>
    <p id={helpId} className="text-sm text-muted-foreground">Toca inicio y salida; en escritorio también puedes arrastrar. Usa las flechas para moverte, Enter para elegir y Esc para cancelar. Toca una noche ocupada para ver detalle. La salida queda libre.</p>
    <div className="overflow-x-auto pb-1">
      <div ref={grid} role="group" aria-label={`Días de ${month}`} aria-describedby={helpId} aria-busy={navigating}
        className="grid min-w-[308px] touch-pan-y grid-cols-7 select-none gap-y-1"
        onTouchStart={(event) => { const point = event.touches[0]; touch.current = event.touches.length === 1 ? { x: point.clientX, y: point.clientY } : null; }}
        onTouchMove={(event) => { if (event.touches.length !== 1) touch.current = null; }}
        onTouchEnd={(event) => {
          const origin = touch.current;
          touch.current = null;
          const point = event.changedTouches[0];
          if (!origin || !point) return;
          const dx = point.clientX - origin.x;
          const dy = point.clientY - origin.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) changeMonth(dx < 0 ? bounds.next : bounds.previous);
        }}
        onTouchCancel={() => { touch.current = null; }}
        onPointerLeave={() => { drag.current = null; setPreview(null); }}
        onPointerCancel={() => { drag.current = null; setPreview(null); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { setSelection(null); setPreview(null); setMessage("Selección cancelada."); }
        }}>
        {WEEKDAYS.map((day) => <span key={day} className="py-2 text-center text-xs font-semibold" aria-hidden="true">{day}</span>)}
        {Array.from({ length: bounds.offset }, (_, i) => <span key={`pad-${i}`} aria-hidden="true" />)}
        {bounds.dates.map((date) => {
          const block = blocks.find((item) => rangeContains(item, date));
          const source = block ? blockStyle(block) : null;
          const selected = !!highlighted && (date === highlighted.start || (highlighted.end !== null && date > highlighted.start && date <= highlighted.end));
          const departure = highlighted?.end === date;
          const guest = block ? firstName(block.stay?.name ?? null) : null; // SD-1129: who is staying, at a glance
          return <button key={date} type="button" data-date={date} tabIndex={date === tabDate ? 0 : -1}
            aria-pressed={selected}
            aria-label={`${date}: ${source ? `${source.label}${guest ? `, ${guest}` : ""}. Ver detalle` : typeof prices[date] === "number" ? `Libre, ${formatPrice(prices[date], currency)} por noche` : "Libre"}${departure ? ". Salida libre del rango seleccionado" : ""}`}
            className={`relative flex min-h-20 min-w-11 flex-col items-center justify-center rounded-lg border text-sm sm:min-h-28 ${FOCUS} ${source?.className ?? "bg-background"} ${selected ? "z-10 ring-2 ring-foreground ring-inset" : ""}`}
            onFocus={() => setFocused(date)}
            onKeyDown={(event) => {
              const target = calendarKeyboardDate(date, event.key);
              if (!target) return;
              event.preventDefault();
              setFocused(target);
              if (monthOf(target) !== month) { requestedFocus.current = target; changeMonth(monthOf(target)); }
              else grid.current?.querySelector<HTMLButtonElement>(`[data-date="${target}"]`)?.focus();
            }}
            onPointerDown={(event) => {
              suppressClick.current = false;
              if (event.pointerType === "mouse" && event.button === 0 && !block) drag.current = date;
            }}
            onPointerEnter={(event) => {
              if (event.pointerType !== "mouse" || !drag.current || event.buttons !== 1) return;
              setPreview(selectCalendarDate({ start: drag.current, end: null }, date, blocks));
            }}
            onPointerUp={(event) => {
              const anchor = drag.current;
              drag.current = null;
              setPreview(null);
              if (!anchor || anchor === date || event.pointerType !== "mouse") return;
              suppressClick.current = true;
              const next = selectCalendarDate({ start: anchor, end: null }, date, blocks);
              if (next?.end) { setSelection(next); setDetail(null); setRangeAction(null); returnFocus.current = event.currentTarget; setMessage(""); setOpen(true); }
              else { setSelection(next); setMessage("Elige una salida posterior, sin noches ocupadas y de hasta 366 noches."); }
            }}
            onClick={(event) => { if (suppressClick.current && event.detail > 0) { suppressClick.current = false; return; } suppressClick.current = false; activate(date, event.currentTarget); }}>
            <time dateTime={date} className="font-semibold" aria-hidden="true">{Number(date.slice(-2))}</time>
            <span className="text-xs" aria-hidden="true">{departure ? "Salida" : source?.short ?? "·"}</span>
            <span data-slot="nightly-price" className={`h-3 w-full truncate px-0.5 text-[11px] ${guest ? "font-medium" : "text-muted-foreground"}`} aria-hidden="true">{guest ?? (typeof prices[date] === "number" && !block ? formatPrice(prices[date], currency) : "")}</span>
          </button>;
        })}
      </div>
    </div>
    <p role="status" className="text-sm">{message || (selection && !selection.end ? `Inicio: ${selection.start}. Elige la fecha de salida.` : "Selecciona las fechas para bloquear noches.")}</p>
    {selection && !open && <Button variant="outline" className="min-h-11" onClick={() => { setSelection(null); setMessage("Selección cancelada."); }}>Cancelar selección</Button>}
    <Dialog.Root open={open} onOpenChange={(value) => { if (!value) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus.current?.focus(); }}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:max-h-dvh sm:w-96 sm:rounded-none sm:p-6">
          <Dialog.Title ref={dialogTitle} tabIndex={-1} className="text-lg font-semibold outline-none">{detail ? "Ver detalle" : rangeAction === "block" ? "Bloquear fechas" : rangeAction === "price" ? "Cambiar precio" : "Acciones para las fechas"}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">{unit.name} · {detail ? blockStyle(detail).label : rangeAction === "price" ? "Precio por rango" : rangeAction === "block" ? "Bloqueo manual" : "Rango seleccionado"}</Dialog.Description>
          {detail ? <BlockDetail block={detail} unitName={unit.name} library={library} today={today} secrets={secrets} onDeleted={() => { setMessage("Bloqueo eliminado."); close(); }} /> : selection?.end ? rangeAction === "block" ? <RangeForm key={`${selection.start}-${selection.end}`} unitId={unit.id} start={selection.start} end={selection.end} onBack={() => setRangeAction(null)} onSaved={() => { setMessage("Bloqueo creado."); close(); }} /> : rangeAction === "price" ? <PriceRangeForm key={`${selection.start}-${selection.end}`} unitId={unit.id} start={selection.start} end={selection.end} currency={currency} onBack={() => setRangeAction(null)} onSaved={(cleared) => { setMessage(cleared ? "Se restauró la tarifa normal para el rango." : "Precio actualizado."); close(); }} /> : <RangeActions start={selection.start} end={selection.end} onChoose={setRangeAction} /> : null}
          <Dialog.Close asChild><Button type="button" variant="outline" className="mt-4 min-h-11 w-full">Cerrar</Button></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </section>;
}

function RangeActions({ start, end, onChoose }: { start: string; end: string; onChoose: (action: "block" | "price") => void }) {
  return <div className="mt-5 space-y-4">
    <p>{start} → {end}</p>
    <p className="font-semibold">{daysBetween(start, end)} noches · salida libre</p>
    <div className="grid gap-3">
      <Button type="button" className="min-h-11 w-full" onClick={() => onChoose("block")}>Bloquear fechas</Button>
      <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => onChoose("price")}>Cambiar precio</Button>
    </div>
  </div>;
}

function RangeForm({ unitId, start, end, onBack, onSaved }: { unitId: string; start: string; end: string; onBack: () => void; onSaved: () => void }) {
  const noteId = useId();
  const [state, action, pending] = useActionState<FormState, FormData>(async (previous, formData) => {
    try {
      const result = await createManualBlockAction(previous, formData);
      if (result.ok) onSaved();
      return result;
    } catch {
      const note = formData.get("note");
      return { ok: false, formError: "No se pudo guardar el bloqueo. Inténtalo de nuevo.", values: { note: typeof note === "string" ? note : "" } };
    }
  }, { ok: false });
  return <form action={action} className="mt-5 space-y-4">
    <input type="hidden" name="unitId" value={unitId} />
    <input type="hidden" name="start" value={start} />
    <input type="hidden" name="end" value={end} />
    <p>{start} → {end}</p>
    <p className="font-semibold">{daysBetween(start, end)} noches · salida libre</p>
    <label htmlFor={noteId} className="block text-sm font-medium">Nota (opcional)</label>
    <textarea id={noteId} name="note" defaultValue={state.values?.note} maxLength={500} rows={3} className={`w-full rounded-md border p-3 ${FOCUS}`} />
    {(state.formError || state.errors) && <div role="alert" className="text-sm text-destructive">{state.formError}{Object.values(state.errors ?? {}).flat().map((error, index) => <p key={index}>{error}</p>)}</div>}
    <Button type="submit" disabled={pending} className="min-h-11 w-full">{pending ? "Guardando…" : "Bloquear fechas"}</Button>
    <Button type="button" variant="ghost" disabled={pending} className="min-h-11 w-full" onClick={onBack}>Volver a las acciones</Button>
  </form>;
}

function PriceRangeForm({ unitId, start, end, currency, onBack, onSaved }: {
  unitId: string; start: string; end: string; currency: "PEN" | "USD"; onBack: () => void; onSaved: (cleared: boolean) => void;
}) {
  const priceId = useId();
  const minNightsId = useId();
  const clearForm = useRef<HTMLFormElement>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(async (previous, formData) => {
    try {
      const result = await setPriceRangeAction(previous, formData);
      if (result.ok) onSaved(false);
      return result;
    } catch {
      return { ok: false, formError: "No se pudo cambiar el precio. Inténtalo de nuevo.", values: { price: String(formData.get("price") ?? ""), minNights: String(formData.get("minNights") ?? "") } };
    }
  }, { ok: false });
  const [clearState, clearAction, clearing] = useActionState<FormState, FormData>(async (previous, formData) => {
    try {
      const result = await clearPriceRangeAction(previous, formData);
      if (result.ok) onSaved(true);
      return result;
    } catch {
      return { ok: false, formError: "No se pudo quitar el cambio de precio. Inténtalo de nuevo." };
    }
  }, { ok: false });
  const hiddenFields = <>
    <input type="hidden" name="unitId" value={unitId} />
    <input type="hidden" name="start" value={start} />
    <input type="hidden" name="end" value={end} />
  </>;
  return <div className="mt-5 space-y-5">
    <div><p>{start} → {end}</p><p className="font-semibold">{daysBetween(start, end)} noches · salida libre</p></div>
    <form action={action} className="space-y-4">
      {hiddenFields}
      <div className="space-y-2">
        <label htmlFor={priceId} className="block text-sm font-medium">Precio por noche ({currency})</label>
        <input id={priceId} name="price" inputMode="decimal" required maxLength={12} defaultValue={state.values?.price} placeholder="0.00" className={`h-11 w-full rounded-md border bg-background px-3 ${FOCUS}`} />
        {state.errors?.price?.map((error) => <p key={error} role="alert" className="text-sm text-destructive">{error}</p>)}
      </div>
      <div className="space-y-2">
        <label htmlFor={minNightsId} className="block text-sm font-medium">Mínimo de noches (opcional)</label>
        <input id={minNightsId} name="minNights" type="number" inputMode="numeric" min={1} max={365} defaultValue={state.values?.minNights} placeholder="Usar el mínimo normal" className={`h-11 w-full rounded-md border bg-background px-3 ${FOCUS}`} />
        <p className="text-xs text-muted-foreground">Si lo dejas vacío, se mantiene el mínimo de la tarifa normal.</p>
        {state.errors?.minNights?.map((error) => <p key={error} role="alert" className="text-sm text-destructive">{error}</p>)}
      </div>
      {(state.formError || state.errors?.end || state.errors?.unitId) && <div role="alert" className="text-sm text-destructive">{state.formError}{[...(state.errors?.end ?? []), ...(state.errors?.unitId ?? [])].map((error) => <p key={error}>{error}</p>)}</div>}
      <Button type="submit" disabled={pending || clearing} className="min-h-11 w-full">{pending ? "Guardando…" : "Guardar cambio de precio"}</Button>
    </form>
    <form ref={clearForm} action={clearAction} className="space-y-2 border-t pt-5">
      {hiddenFields}
      <Button type="button" variant="destructive" disabled={pending || clearing} className="min-h-11 w-full" onClick={() => setConfirmClear(true)}>{clearing ? "Quitando…" : "Quitar cambio de precio"}</Button>
      <p className="text-xs text-muted-foreground">Estas fechas volverán a usar su tarifa normal o de temporada.</p>
      {(clearState.formError || clearState.errors) && <div role="alert" className="text-sm text-destructive">{clearState.formError}{Object.values(clearState.errors ?? {}).flat().map((error, index) => <p key={index}>{error}</p>)}</div>}
    </form>
    <ConfirmDialog open={confirmClear} onOpenChange={setConfirmClear} title="¿Quitar el cambio de precio?" description={`${start} → ${end}. Estas fechas volverán a usar su tarifa normal o de temporada.`} confirmLabel="Quitar cambio" cancelLabel="Cancelar" destructive onConfirm={() => clearForm.current?.requestSubmit()} />
    <Button type="button" variant="ghost" disabled={pending || clearing} className="min-h-11 w-full" onClick={onBack}>Volver a las acciones</Button>
  </div>;
}

function BlockDetail({ block, unitName, library, today, secrets, onDeleted }: {
  block: CalendarBlock; unitName: string; library: { templates: Template[]; house: HouseInfo } | null; today: string;
  secrets: { byBlock: Record<string, Pick<HouseInfo, "wifiPassword" | "doorCode">>; configured: { wifi_clave: boolean; codigo_puerta: boolean } } | null; onDeleted: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return <div className="mt-5 space-y-4">
    <p>{block.start} → {block.end}</p>
    <p className="font-semibold">{daysBetween(block.start, block.end)} noches · salida libre</p>
    <p className="whitespace-pre-wrap break-words text-sm">{block.note || "Sin nota."}</p>
    {block.stayKey && block.stay && <StayDetailsCard key={block.id} stayKey={block.stayKey} initial={block.stay} messages={library && today ? { templates: library.templates, house: { ...library.house, ...(secrets?.byBlock[block.id] ?? {}) }, unit: unitName, checkIn: block.start, checkOut: block.end, today, secretsConfigured: secrets?.configured } : null} />}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {block.derived ? <p className="text-sm text-muted-foreground">Se libera sola al cancelar la reserva que la originó.</p> : block.source === "manual" ? <>
      <Button variant="destructive" className="min-h-11 w-full" disabled={pending} onClick={() => setConfirm(true)}>{pending ? "Eliminando…" : "Eliminar bloqueo"}</Button>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="¿Eliminar bloqueo manual?" description={`${block.start} → ${block.end}. Las noches quedarán libres.`} confirmLabel="Eliminar bloqueo" cancelLabel="Cancelar" destructive onConfirm={() => startTransition(async () => {
        try {
          const data = new FormData();
          data.set("id", block.id);
          const result = await deleteManualBlockAction(data);
          if (result.ok) onDeleted(); else setError(result.error);
        } catch { setError("No se pudo eliminar el bloqueo. Inténtalo de nuevo."); }
      })} />
    </> : <p className="text-sm text-muted-foreground">Solo lectura. Este bloque se gestiona desde su reserva o calendario de origen.</p>}
  </div>;
}
