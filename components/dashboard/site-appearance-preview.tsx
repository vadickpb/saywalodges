import { themeToCssVars, type ResolvedTheme } from "@/lib/domain/site-theme";

// Live preview of the tenant theme inside the dashboard (SD-210). It renders
// with the very same themeToCssVars() the public site uses, so colors, derived
// tints, button label colors and radius are exact. The site's web fonts are not
// loaded in the dashboard, so typography is approximated with system stacks.
const PREVIEW_FONTS = {
  editorial: { heading: "Georgia, 'Times New Roman', serif", body: "ui-sans-serif, system-ui, sans-serif" },
  modern: { heading: "ui-sans-serif, system-ui, sans-serif", body: "ui-sans-serif, system-ui, sans-serif" },
  classic: { heading: "Georgia, 'Times New Roman', serif", body: "ui-serif, Georgia, serif" },
} as const;

export function SiteAppearancePreview({
  theme,
  name,
  headline,
  tagline,
}: {
  theme: ResolvedTheme;
  name: string;
  headline: string;
  tagline: string;
}) {
  const fonts = PREVIEW_FONTS[theme.fontPair];
  const style = {
    ...themeToCssVars(theme),
    "--site-font-heading": fonts.heading,
    "--site-font-body": fonts.body,
  } as React.CSSProperties;

  return (
    <figure className="m-0">
      <div
        style={style}
        className="overflow-hidden rounded-lg border border-border bg-site-bg font-[family-name:var(--site-font-body)] text-site-fg"
      >
        <div className="flex items-center justify-between border-b border-site-line px-4 py-3">
          <span className="font-[family-name:var(--site-font-heading)] text-base font-semibold text-site-primary">{name}</span>
          <span className="text-xs text-site-muted">ES · EN</span>
        </div>
        <div className="flex flex-col gap-3 px-4 py-6">
          <h2 className="font-[family-name:var(--site-font-heading)] text-2xl font-semibold leading-tight">{headline || name}</h2>
          {tagline && <p className="text-sm text-site-muted">{tagline}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="rounded-[var(--site-radius)] bg-site-primary px-4 py-2 text-sm font-medium text-site-primary-fg">
              Reservar
            </span>
            <span className="rounded-[var(--site-radius)] bg-site-accent px-4 py-2 text-sm font-medium text-site-accent-fg">
              WhatsApp
            </span>
          </div>
        </div>
        <div className="border-t border-site-line bg-site-surface px-4 py-4">
          <p className="text-sm font-semibold text-site-primary">Enlace y títulos en color primario</p>
          <p className="mt-1 text-sm text-site-accent">Detalles en color de acento</p>
          <div className="mt-3 rounded-[var(--site-radius)] border border-site-line bg-site-bg px-3 py-2 text-sm text-site-muted">
            Tarjeta con el radio de borde elegido
          </div>
        </div>
      </div>
      <figcaption className="mt-2 text-xs text-muted-foreground">
        Vista previa aproximada: las fuentes reales del sitio se ven al publicar.
      </figcaption>
    </figure>
  );
}
