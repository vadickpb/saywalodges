"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SiteAppearancePreview } from "@/components/dashboard/site-appearance-preview";
import type { SiteContent } from "@/lib/domain/site-content";
import {
  FONT_PAIRS,
  PRESETS,
  PRESET_IDS,
  RADII,
  contrastWarnings,
  resolveTheme,
  type FontPair,
  type PresetId,
  type Radius,
  type ResolvedTheme,
} from "@/lib/domain/site-theme";
import { saveAppearance, type AppearanceState } from "./actions";

const INITIAL_STATE: AppearanceState = { ok: false };
const HEX = /^#[0-9a-fA-F]{6}$/;

const PRESET_LABEL: Record<PresetId, string> = {
  andino: "Andino",
  costa: "Costa",
  selva: "Selva",
  colonial: "Colonial",
  noche: "Noche",
};
const FONT_LABEL: Record<FontPair, string> = {
  editorial: "Editorial (serif elegante)",
  modern: "Moderna (sans-serif)",
  classic: "Clásica (serif de lectura)",
};
const RADIUS_LABEL: Record<Radius, string> = { sharp: "Recto", soft: "Suave", round: "Redondeado" };
const COLOR_LABEL = { primary: "Color primario", accent: "Color de acento", background: "Color de fondo" } as const;
type ColorKey = keyof typeof COLOR_LABEL;
const COLOR_KEYS = Object.keys(COLOR_LABEL) as ColorKey[];

const PAIR_FIELDS = [
  { key: "headline", label: "Titular", multiline: false, max: 160 },
  { key: "tagline", label: "Lema", multiline: false, max: 160 },
  { key: "region", label: "Región", multiline: false, max: 160 },
  { key: "intro", label: "Introducción", multiline: true, max: 1200 },
  { key: "spacesIntro", label: "Texto de los espacios", multiline: true, max: 1200 },
  { key: "locationBlurb", label: "Texto de ubicación", multiline: true, max: 1200 },
] as const;
type PairKey = (typeof PAIR_FIELDS)[number]["key"];

type Pair = { es: string; en: string };
type Row = { id: string };
type HighlightRow = Row & Pair;
type FaqRow = Row & { qEs: string; qEn: string; aEs: string; aEn: string };

const MAX_HIGHLIGHTS = 6;
const MAX_FAQ = 12;

let rowCounter = 0;
const newId = () => `row-${++rowCounter}`;

const pairOf = (value: Pair | undefined): Pair => ({ es: value?.es ?? "", en: value?.en ?? "" });

const PATH_LABEL: Record<string, string> = {
  "theme.primary": COLOR_LABEL.primary,
  "theme.accent": COLOR_LABEL.accent,
  "theme.background": COLOR_LABEL.background,
  "theme.preset": "Preset",
  "theme.fontPair": "Tipografía",
  "theme.radius": "Radio de borde",
};

function ColorField({
  colorKey,
  value,
  onChange,
}: {
  colorKey: ColorKey;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const valid = HEX.test(value);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{COLOR_LABEL[colorKey]}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${COLOR_LABEL[colorKey]}: selector`}
          value={valid ? value.toLowerCase() : "#000000"}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="h-11 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
        />
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          inputMode="text"
          aria-invalid={valid ? undefined : true}
          aria-describedby={valid ? undefined : `${id}-error`}
          className="h-11 font-mono"
        />
      </div>
      {!valid && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          Usa un color hexadecimal de 6 dígitos, por ejemplo #2D4A3E.
        </p>
      )}
    </div>
  );
}

function PairField({
  label,
  value,
  onChange,
  multiline,
  max,
}: {
  label: string;
  value: Pair;
  onChange: (value: Pair) => void;
  multiline: boolean;
  max: number;
}) {
  const id = useId();
  const Control = multiline ? Textarea : Input;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(["es", "en"] as const).map((lang) => (
        <div key={lang} className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-${lang}`}>
            {label} ({lang})
          </Label>
          <Control
            id={`${id}-${lang}`}
            value={value[lang]}
            maxLength={max}
            onChange={(event) => onChange({ ...value, [lang]: event.target.value })}
            {...(multiline ? { rows: 4 } : {})}
          />
        </div>
      ))}
    </div>
  );
}

function Radio({
  name,
  value,
  checked,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50">
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="size-4" />
      {children}
    </label>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-semibold text-foreground">{title}</legend>
      {hint && <p className="-mt-2 text-sm text-muted-foreground">{hint}</p>}
      {children}
    </fieldset>
  );
}

// Client component: holds the entire draft (theme + copy) so the preview and
// the contrast warning update as you type. Nothing here is trusted by the
// server — the draft goes out as one JSON `payload` that saveAppearance
// re-validates with the domain's zod schemas and scopes to the session's org.
export function AppearanceForm({
  initialTheme,
  initialContent,
  propertyName,
}: {
  initialTheme: ResolvedTheme;
  initialContent: SiteContent;
  propertyName: string;
}) {
  const [state, formAction, isPending] = useActionState(saveAppearance, INITIAL_STATE);

  const [preset, setPreset] = useState<PresetId>(initialTheme.preset);
  const [colors, setColors] = useState<Record<ColorKey, string>>({
    primary: initialTheme.primary,
    accent: initialTheme.accent,
    background: initialTheme.background,
  });
  const [fontPair, setFontPair] = useState<FontPair>(initialTheme.fontPair);
  const [radius, setRadius] = useState<Radius>(initialTheme.radius);

  const [pairs, setPairs] = useState<Record<PairKey, Pair>>(() => ({
    headline: pairOf(initialContent.headline),
    tagline: pairOf(initialContent.tagline),
    region: pairOf(initialContent.region),
    intro: pairOf(initialContent.intro),
    spacesIntro: pairOf(initialContent.spacesIntro),
    locationBlurb: pairOf(initialContent.locationBlurb),
  }));
  const [capacity, setCapacity] = useState(initialContent.capacity?.toString() ?? "");
  const [highlights, setHighlights] = useState<HighlightRow[]>(() =>
    (initialContent.highlights ?? []).map((h) => ({ id: newId(), ...pairOf(h) }))
  );
  const [faq, setFaq] = useState<FaqRow[]>(() =>
    (initialContent.faq ?? []).map((item) => ({
      id: newId(),
      qEs: item.question.es,
      qEn: item.question.en,
      aEs: item.answer.es,
      aEn: item.answer.en,
    }))
  );

  const colorsValid = COLOR_KEYS.every((key) => HEX.test(colors[key]));
  const capacityNumber = capacity.trim() === "" ? undefined : Number(capacity);
  const capacityValid = capacityNumber === undefined || (Number.isInteger(capacityNumber) && capacityNumber >= 1 && capacityNumber <= 200);

  // Invalid hex falls back to the preset's color for the preview only; the
  // save button stays disabled until every color is valid.
  const draftTheme = resolveTheme({
    preset,
    primary: HEX.test(colors.primary) ? colors.primary : PRESETS[preset].primary,
    accent: HEX.test(colors.accent) ? colors.accent : PRESETS[preset].accent,
    background: HEX.test(colors.background) ? colors.background : PRESETS[preset].background,
    fontPair,
    radius,
  });
  const warnings = contrastWarnings(draftTheme);

  const payload = JSON.stringify({
    theme: { preset, ...colors, fontPair, radius },
    content: {
      ...Object.fromEntries(PAIR_FIELDS.map(({ key }) => [key, pairs[key]])),
      ...(capacityNumber !== undefined ? { capacity: capacityNumber } : {}),
      highlights: highlights.map(({ es, en }) => ({ es, en })),
      faq: faq.map((row) => ({ question: { es: row.qEs, en: row.qEn }, answer: { es: row.aEs, en: row.aEn } })),
    },
  });

  useEffect(() => {
    if (state.ok) toast.success("Apariencia guardada");
    else if (state.formError) toast.error(state.formError);
  }, [state]);

  function choosePreset(next: PresetId) {
    const base = PRESETS[next];
    setPreset(next);
    setColors({ primary: base.primary, accent: base.accent, background: base.background });
    setFontPair(base.fontPair);
    setRadius(base.radius);
  }

  const patchFaq = (id: string, patch: Partial<FaqRow>) =>
    setFaq((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  return (
    <form action={formAction} className="grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <input type="hidden" name="payload" value={payload} />

      <div className="flex flex-col gap-6">
        <Section title="Tema" hint="Elegir un preset restablece colores, tipografía y radio; después puedes ajustarlos.">
          <div role="radiogroup" aria-label="Preset" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PRESET_IDS.map((id) => (
              <Radio key={id} name="preset-choice" value={id} checked={preset === id} onChange={() => choosePreset(id)}>
                <span className="flex">
                  {(["primary", "accent", "background"] as const).map((key) => (
                    <span
                      key={key}
                      aria-hidden="true"
                      className="-ml-1 size-4 rounded-full border border-border first:ml-0"
                      style={{ backgroundColor: PRESETS[id][key] }}
                    />
                  ))}
                </span>
                {PRESET_LABEL[id]}
              </Radio>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {COLOR_KEYS.map((key) => (
              <ColorField key={key} colorKey={key} value={colors[key]} onChange={(value) => setColors((c) => ({ ...c, [key]: value }))} />
            ))}
          </div>

          <div role="status" aria-live="polite">
            {warnings.length > 0 && (
              <div className="rounded-md border border-amber-500/60 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
                <p className="font-semibold">Contraste insuficiente</p>
                <ul className="mt-1 list-disc pl-5">
                  {warnings.map((warning) => (
                    <li key={warning.pair}>
                      {COLOR_LABEL[warning.pair]}: {warning.ratio}:1 sobre el fondo (WCAG AA pide 4.5:1). Los botones siguen
                      siendo legibles, pero títulos y enlaces con este color pueden costar leerse. Puedes guardar de todos modos.
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-foreground">Par tipográfico</legend>
              {FONT_PAIRS.map((value) => (
                <Radio key={value} name="font-choice" value={value} checked={fontPair === value} onChange={() => setFontPair(value)}>
                  {FONT_LABEL[value]}
                </Radio>
              ))}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-foreground">Radio de borde</legend>
              {RADII.map((value) => (
                <Radio key={value} name="radius-choice" value={value} checked={radius === value} onChange={() => setRadius(value)}>
                  {RADIUS_LABEL[value]}
                </Radio>
              ))}
            </fieldset>
          </div>
        </Section>
      </div>

      <aside aria-label="Vista previa" className="lg:row-span-2 lg:row-start-1 lg:col-start-2">
        <div className="lg:sticky lg:top-4">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Vista previa</h2>
          <SiteAppearancePreview
            theme={draftTheme}
            name={propertyName}
            headline={pairs.headline.es || pairs.headline.en}
            tagline={pairs.tagline.es || pairs.tagline.en}
          />
        </div>
      </aside>

      <div className="flex flex-col gap-6">
        <Section title="Textos del sitio" hint="Si dejas un texto vacío en los dos idiomas, el sitio usa los datos de «Ajustes».">
          {PAIR_FIELDS.map(({ key, label, multiline, max }) => (
            <PairField
              key={key}
              label={label}
              multiline={multiline}
              max={max}
              value={pairs[key]}
              onChange={(value) => setPairs((p) => ({ ...p, [key]: value }))}
            />
          ))}
          <div className="flex max-w-40 flex-col gap-1.5">
            <Label htmlFor="capacity">Capacidad (huéspedes)</Label>
            <Input
              id="capacity"
              type="number"
              inputMode="numeric"
              min={1}
              max={200}
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
              aria-invalid={capacityValid ? undefined : true}
            />
            {!capacityValid && (
              <p role="alert" className="text-sm text-destructive">
                Un número entero entre 1 y 200.
              </p>
            )}
          </div>
        </Section>

        <Section title="Destacados" hint={`Hasta ${MAX_HIGHLIGHTS}. Cada uno debe estar en español e inglés.`}>
          <ul className="flex flex-col gap-4">
            {highlights.map((row, index) => (
              <li key={row.id} className="flex flex-col gap-2 border-b border-border pb-4 last:border-b-0 last:pb-0">
                <PairField
                  label={`Destacado ${index + 1}`}
                  multiline={false}
                  max={160}
                  value={{ es: row.es, en: row.en }}
                  onChange={(value) => setHighlights((rows) => rows.map((r) => (r.id === row.id ? { ...r, ...value } : r)))}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 self-start"
                  onClick={() => setHighlights((rows) => rows.filter((r) => r.id !== row.id))}
                >
                  Quitar destacado {index + 1}
                </Button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 self-start"
            disabled={highlights.length >= MAX_HIGHLIGHTS}
            onClick={() => setHighlights((rows) => [...rows, { id: newId(), es: "", en: "" }])}
          >
            Añadir destacado
          </Button>
        </Section>

        <Section title="Preguntas frecuentes" hint={`Hasta ${MAX_FAQ}. Cada pregunta y respuesta debe estar en español e inglés.`}>
          <ul className="flex flex-col gap-4">
            {faq.map((row, index) => (
              <li key={row.id} className="flex flex-col gap-3 border-b border-border pb-4 last:border-b-0 last:pb-0">
                <PairField
                  label={`Pregunta ${index + 1}`}
                  multiline={false}
                  max={160}
                  value={{ es: row.qEs, en: row.qEn }}
                  onChange={(value) => patchFaq(row.id, { qEs: value.es, qEn: value.en })}
                />
                <PairField
                  label={`Respuesta ${index + 1}`}
                  multiline
                  max={1200}
                  value={{ es: row.aEs, en: row.aEn }}
                  onChange={(value) => patchFaq(row.id, { aEs: value.es, aEn: value.en })}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 self-start"
                  onClick={() => setFaq((rows) => rows.filter((r) => r.id !== row.id))}
                >
                  Quitar pregunta {index + 1}
                </Button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 self-start"
            disabled={faq.length >= MAX_FAQ}
            onClick={() => setFaq((rows) => [...rows, { id: newId(), qEs: "", qEn: "", aEs: "", aEn: "" }])}
          >
            Añadir pregunta
          </Button>
        </Section>

        <Section title="Reseñas">
          <p className="text-sm text-muted-foreground">
            Aún no hay una fuente verificable de reseñas, así que el sitio no muestra ninguna. No se pueden escribir a mano.
          </p>
        </Section>

        <div className="flex flex-col gap-3">
          {state.formError && !state.ok && (
            <p role="alert" className="text-sm text-destructive">
              {state.formError}
              {state.paths && state.paths.length > 0 && (
                <> Revisa: {state.paths.map((path) => PATH_LABEL[path] ?? path).join(", ")}.</>
              )}
            </p>
          )}
          <Button type="submit" disabled={isPending || !colorsValid || !capacityValid} className="min-h-11 self-start">
            {isPending ? "Guardando…" : "Guardar apariencia"}
          </Button>
        </div>
      </div>
    </form>
  );
}
