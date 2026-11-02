# Arquitectura: cómo funciona Saywa Direct

Guía para entender el proyecto de punta a punta. Las decisiones y su justificación están en [`docs/adr/`](adr/);
el estado de cada ticket, en [`docs/roadmap.md`](roadmap.md).

## Idea central

Una sola aplicación Next.js sirve a **muchos alojamientos (tenants)**. Cada tenant es una `organization`
con su propio sitio público, su panel y sus datos. Lo que impide que un tenant vea los datos de otro no es
el código de la app sino **Postgres (RLS)**.

## Las dos «caras» de la app

| Cara | Ejemplo de URL | Código | Quién entra |
|---|---|---|---|
| Sitio público del alojamiento | `saywa-lodges.<dominio>/es` | `app/sites/[host]/[lang]` | Huéspedes (sin login) |
| Panel del dueño | `app.<dominio>/…` | `app/app/*` | Dueño/staff (con login) |
| Plataforma (login, cron) | `<dominio>/login`, `/api/cron/*` | `app/(platform)`, `app/api` | Todos / cron |

`proxy.ts` solo **reescribe** la petición según el host y el idioma (ADR 0001). No consulta la BD ni
autoriza: la autorización real vive en la capa de datos. Las decisiones de enrutado son una función pura,
`lib/domain/host-routing.ts`, con dos modos (`DEPLOYMENT_MODE`):

- **`platform`** (por defecto): `ROOT_DOMAIN` y `app.<ROOT_DOMAIN>` son la plataforma; `<sub>.<ROOT_DOMAIN>` y cualquier otro
  host son sitios de alojamientos.
- **`installation`** (una instalación por cliente, ADR 0010): `ROOT_DOMAIN` es el sitio público del cliente (se busca por
  `properties.custom_domain = ROOT_DOMAIN`); `app.<ROOT_DOMAIN>` sirve panel, login, auth y **todas** las rutas `/api/*`;
  cualquier otro host da 404 sin consultar la base.

En ambos modos, una petición rechazada con 404 (por ejemplo `/login` en un host de sitio) ya no refresca la cookie de
sesión, y los hosts de plataforma reenvían la petición con la sesión refrescada (`NextResponse.next({ request })`).

## Capas (de afuera hacia adentro)

```
Navegador
   │
proxy.ts            ← host + idioma → reescribe a la ruta correcta (no autoriza)
   │
app/…               ← páginas (Server Components) y server actions (validan con zod)
   │
lib/dal/*           ← ÚNICA puerta a los datos: verifica sesión y membresía (import "server-only")
lib/dal/public/*    ← lecturas del sitio público (cliente anon; RLS filtra lo publicado)
   │
lib/domain/*        ← lógica de negocio pura, sin I/O: precios, fechas, disponibilidad, finanzas
   │
Supabase (Postgres)  ← tablas con org_id + RLS, RPCs transaccionales, exclusion constraint
```

Reglas que sostienen el diseño:

- **Todo acceso a datos pasa por `lib/dal`.** Ninguna página importa un cliente de Supabase directamente.
- **La service-role** (`lib/supabase/admin.ts`) solo se usa en cron, webhooks y RPCs; nunca en páginas ni acciones de usuario.
- **El servidor calcula los precios** (`lib/domain/pricing.ts`); jamás se acepta un monto del cliente.
- **Dinero** en enteros (céntimos) + moneda; **estancias** como `date` en rango `[check_in, check_out)`, zona `America/Lima`.
- **La doble reserva la impide la base de datos** (exclusion constraint en `calendar_blocks`, ADR 0003), no la app.

## Una reserva, de punta a punta

Leyenda: ✅ código ya mergeado en `main` (el cumplimiento de los criterios de cada ticket se sigue en el roadmap) · 🚧 pendiente.

1. ✅ **Disponibilidad pública**: el sitio muestra qué fechas están libres
   (`lib/dal/public/availability.ts` → `lib/domain/public-availability.ts`).
2. ✅ **El servidor calcula el precio** de una estancia con las tarifas guardadas
   (`lib/domain/pricing.ts`, ADR 0005 y 0006), y el panel tiene un simulador (`/app/rates/simulator`).
3. 🚧 **Cotización y link de reserva** (SD-402, SD-403): el dueño genera una cotización y la comparte;
   el huésped abre `/reserva/[public_token]`.
4. ✅ **Crear la reserva** (esquema y RPC, SD-401): `create_booking_from_quote` crea en **una transacción**
   el huésped, la reserva y un bloque de calendario con *hold* de pago. Si las fechas ya están ocupadas,
   el exclusion constraint de `calendar_blocks` rechaza la operación (ADR 0003).
5. ✅ **Estado y expiración del hold** (SD-408): la página pública de estado muestra la reserva y el cron
   `/api/cron/expire-holds` (con `CRON_SECRET`) libera las fechas si no se paga (`docs/cron.md`).
6. 🚧 **Pago** (SD-405 voucher manual, SD-501–502 Mercado Pago): el dueño confirma con `confirm_payment`.
7. ✅ **Calendario sincronizado** con Airbnb/Booking por iCal: exporta un feed por canal e importa los
   externos (`lib/ical`, `app/api/ical`, cron `/api/cron/ical-sync`).
8. ✅ **Finanzas** (ADR 0007 y 0008): libro de ingresos y egresos, reportes y Excel para el contador;
   los ingresos de reservas y del calendario se registran automáticamente.

## Base de datos

- Esquema versionado en `supabase/migrations/` (una migración por ticket; el estado en producción se ve en el workflow *Deploy database*).
- **Toda tabla de negocio** tiene `org_id` y RLS habilitado, con políticas por operación que usan `is_member(org_id)`.
- Las operaciones de varias tablas son **RPCs** (`security definer`, `set search_path = ''`) con su propio test.
- Tests pgTAP en `supabase/tests/` (aislamiento entre organizaciones, RPCs, constraints) y pruebas de
  concurrencia en `supabase/tests-concurrency/`.
- Local: `npx supabase db reset` reconstruye todo desde las migraciones + `supabase/seed.sql`
  (organizaciones `saywa-lodges` y `demo`).
- Producción: se actualiza solo mediante el workflow *Deploy database* con aprobación (ver `docs/workflow.md`).

## Dónde está cada cosa

| Quiero… | Mira en… |
|---|---|
| Entender o cambiar un precio | `lib/domain/pricing.ts`, `app/app/rates` |
| Ver cómo se evita la doble reserva | `supabase/migrations/*calendar_blocks.sql`, ADR 0003 |
| Cambiar lo que ve el huésped | `app/sites/[host]/[lang]`, `components/site` |
| Cambiar el panel | `app/app/*`, `components/dashboard`, `components/ui` |
| Añadir un acceso a datos | `lib/dal/*` (y su test) |
| Textos es/en | `dictionaries/` |
| Finanzas (ingresos, egresos, Excel) | `lib/domain/finance*.ts`, `lib/dal/finance*.ts`, `app/app/finance` |
| Calendario e iCal | `lib/ical`, `lib/dal/ical-*.ts`, `app/app/calendar` |
| Logs y observabilidad | `lib/log.ts`, `docs/observability.md` |

## Calidad y entrega

- **CI** (`.github/workflows/ci.yml`): lint, typecheck, tests con cobertura, build, y `supabase db reset` + pgTAP.
- **Revisión**: subagentes `reviewer` y `security-reviewer` antes de cada PR (`.claude/agents/`).
- **Un PR por ticket**, squash merge, Conventional Commits.
- **Despliegue**: Vercel para la app; *Deploy database* para el esquema.
