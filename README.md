# Saywa Direct

SaaS multi-tenant de reservas directas para alojamientos independientes en Perú: web con dominio
propio, tarifas, cotizador/link de reserva, pagos, calendario sincronizado con Airbnb/Booking (iCal)
y CRM básico de huéspedes — sin comisión por reserva.

Este repositorio nace de **Saywa Lodges** (un lodge real en el Valle Sagrado, Urubamba), que hoy es
el primer tenant de la plataforma mientras evoluciona hacia multi-tenant. Roadmap completo y estado
de cada ticket: [`docs/roadmap.md`](docs/roadmap.md). Decisiones de arquitectura: [`docs/adr/`](docs/adr/).

## Stack

- **Next.js 16** (App Router, `proxy.ts`), **React 19**, TypeScript estricto, **Tailwind v4**.
- **Supabase**: Postgres (con RLS), Storage, Auth (desde Fase 1).
- **Vercel** para despliegue.

## Arquitectura (resumen)

- Hoy: single-tenant. `lib/property.ts` resuelve siempre la propiedad `saywa-lodges` (constante).
- `lib/supabase.ts` expone un cliente server-only con la service-role key, tipado contra
  `lib/database.types.ts` (generado desde el esquema — ver abajo). Este cliente es temporal: a
  partir de Fase 1 las lecturas públicas migran a un cliente `anon` dentro de `lib/dal/`, y la
  service-role queda solo para webhooks/cron/RPCs (ver [ADR 0002](docs/adr/0002-rls-and-dal.md)).
- `/admin` + `/api/admin/*`: panel de edición de contenido actual (Basic Auth). Es temporal —
  Fase 2 lo reemplaza por un dashboard real (SD-203 lo elimina).
- Multi-tenant por host, RLS, el constraint que impide doble reserva, y el modelo de pagos están
  decididos en los ADRs 0001–0004.

## Desarrollo local

### Requisitos

- Node.js ≥ 24 (`engines.node` en `package.json`; coincide con el runtime por defecto de Vercel). El
  mínimo técnico real para `--env-file` y `WebSocket` nativo es Node 22, pero se fija en 24 para que
  `@types/node` y el runtime de producción no se desalineen.
- [Docker](https://www.docker.com/) corriendo (lo usa la CLI de Supabase para levantar Postgres
  localmente).
- La [CLI de Supabase](https://supabase.com/docs/guides/cli) (se invoca vía `npx supabase`, no
  hace falta instalarla globalmente).

### Setup

```bash
npm install
cp .env.example .env.local   # completar NEXT_PUBLIC_SITE_URL, ADMIN_USER/PASSWORD
npx supabase start            # levanta Postgres + Storage + Studio en Docker
```

`supabase start` imprime las credenciales locales (`API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`, …).
Para desarrollar **contra el Postgres local** (recomendado — no toca producción), usa esas
credenciales locales como `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` en `.env.local`. Para
desarrollar contra el proyecto real, usa las credenciales de Supabase → Project Settings → API Keys
(pide acceso al dueño del proyecto).

```bash
npm run dev
```

Abre `http://localhost:3000/es` (o `/en`).

### Base de datos

El esquema vive versionado en `supabase/migrations/` (nunca se edita a mano la base remota — todo
cambio es un archivo de migración nuevo; ver `supabase/CLAUDE.md` y la skill `.claude/skills/db-migration`).

```bash
npx supabase db reset   # recrea la BD local desde las migraciones + supabase/seed.sql
```

`supabase/seed.sql` carga el contenido real de Saywa Lodges (propiedad, habitaciones, tarifas,
amenities, distancias, 27 fotos), así el entorno local tiene los mismos datos que producción. Las
filas de `photos` apuntan a rutas reales del bucket `property-photos`; los *archivos* de imagen
solo existen en el Storage remoto por ahora, así que localmente las fotos no cargan (SD-202
resuelve esto).

Tras cualquier cambio de esquema, regenerar los tipos de TypeScript:

```bash
npx supabase gen types typescript --local > lib/database.types.ts
```

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Tests unitarios (Vitest) |

## Estado del proyecto

En desarrollo activo, siguiendo el roadmap por tickets (`SD-XXX`) en [`docs/roadmap.md`](docs/roadmap.md).
Convenciones de código y flujo de trabajo: [`CLAUDE.md`](CLAUDE.md).
