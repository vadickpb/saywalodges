# Sistema de diseño del dashboard (SD-107)

Guía breve para `components/ui/*`. Gobierna solo el **dashboard** (`app/app/**`, la app
"Saywa Direct" en sí); el sitio público de cada tenant tiene su propia marca y no usa nada de esto
(ver `app/globals.css`, sección pública en `:root`).

Showcase en vivo (solo desarrollo): `http://localhost:3000/app/ui`.

**Nota sobre `cn()`**: todos los componentes importan `cn` del paquete npm `"cn"`, no de
`@/lib/utils` (esa ruta no existe en este proyecto, aunque `components.json` la liste por ser el
default del esquema de shadcn — esta versión del CLI usa el paquete en vez de generar el helper
tradicional). Si copias un componente de otra fuente que importe `cn` desde `@/lib/utils`, cambia
el import a `"cn"` en vez de crear ese archivo.

## Paleta

Tokens en `app/globals.css`, dentro de `.dashboard` (claro) y `.dashboard.dark` (oscuro). Para
recolorear todo el dashboard, cambia `--primary`/`--accent` en ambos bloques — todos los
componentes usan nombres semánticos (`bg-primary`, `text-muted-foreground`, …), nunca hex directo.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--background` | `#F8FAFC` | `#0F172A` | fondo de página |
| `--foreground` | `#0F172A` | `#F1F5F9` | texto principal |
| `--card` | `#FFFFFF` | `#1E293B` | superficie de tarjetas/paneles |
| `--primary` | `#4F46E5` (índigo) | `#818CF8` | acción principal, marca |
| `--accent` | `#EEF2FF` | `#312E81` | hover, estado activo de nav |
| `--muted-foreground` | `#475569` | `#94A3B8` | texto secundario |
| `--destructive` | `#DC2626` | `#EF4444` | acciones destructivas, errores |

No hay `--success`/`--warning` compartidos: un mismo verde/ámbar no puede pasar AA a la vez como
fondo sólido con texto blanco (botones) y como texto plano sobre el fondo de página, en ambos modos
— lo verificamos y falla (hasta 2.15:1 en oscuro, contra el 4.5:1 que exige el tamaño de texto
usado). `StatusBadge` y `MetricCard` usan paletas literales de Tailwind (`green-100`/`green-800` +
`dark:green-950`/`dark:green-300`, etc.), cada combinación verificada por separado contra su propio
fondo — ver `components/ui/status-badge.tsx` y `components/ui/metric-card.tsx`.

Contraste verificado (fórmula de luminancia relativa WCAG) para los 8 pares principales
(texto/fondo, texto sobre `primary`, texto secundario, texto sobre `accent`) y para los 6 pares de
`StatusBadge`/`MetricCard`: todos ≥4.5:1 en ambos modos.

## Modo oscuro

Manual, no por preferencia del sistema: un botón (`ThemeToggle`) escribe una cookie
(`dashboard-theme`) que `app/app/layout.tsx` lee en el servidor para aplicar la clase `.dark` sobre
`.dashboard` — sin parpadeo de tema incorrecto. No se usa `next-themes`: esa librería asume que
controla `<html>` globalmente, y el modo oscuro aquí es solo del dashboard.

## Tipografía y espaciado

Misma familia que el resto del proyecto (`--font-geist-sans`, heredada del layout raíz). Espaciado:
la escala estándar de Tailwind (`gap-2`, `p-6`, …); `--radius: 0.5rem` para esquinas de tarjetas,
inputs y botones.

## Cuándo usar cada componente

- **Button**: toda acción clicable. `variant="destructive"` solo para eliminar/cancelar
  irreversible; `variant="ghost"`/`"outline"` para acciones secundarias.
- **Input** + **Label**: siempre junto a su label (accesibilidad). `Select` para listas cerradas
  cortas (moneda, estado); si la lista crece mucho, revisar antes de reusar tal cual.
- **DatePicker**: cualquier fecha única (check-in, check-out). Para rangos, extender con
  `mode="range"` de `react-day-picker` cuando haga falta (no implementado todavía, no hay caso de
  uso real aún).
- **DataTable**: cualquier listado con estados vacío/cargando/error. No ordena ni filtra — eso se
  añade en el ticket que primero lo necesite de verdad (SD-406 para reservas, por ejemplo).
- **MetricCard**: tarjetas de resumen numérico (KPIs) en la página principal del dashboard.
- **StatusBadge**: solo para el estado de una reserva (`confirmed`/`pending`/`blocked`). Para otros
  estados de dominio, usar `Badge` directamente con `variant`.
- **ConfirmDialog**: cualquier acción destructiva o irreversible antes de ejecutarla.
- **Toaster/sonner**: feedback de una acción puntual (guardado, error de red). No para errores de
  validación de formulario — esos van inline, junto al campo.
- **SidebarNav** / **MobileBottomNav**: la navegación del dashboard. Presentacionales — SD-106 les
  pasa los items reales y el `activeHref` desde el router.

## No usar aquí

- Nada de `components/` (sitio público: `Hero`, `Gallery`, …) — otra marca, otro propósito.
- `app/admin/page.tsx` — panel legado, se elimina en SD-203, no se migra a este sistema.
