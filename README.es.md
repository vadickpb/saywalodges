# Saywa Direct

[![CI](https://github.com/vadickpb/saywalodges/actions/workflows/ci.yml/badge.svg)](https://github.com/vadickpb/saywalodges/actions/workflows/ci.yml)

Sistema de reservas directas para alojamientos independientes en Perú, **instalado por cliente**: web con dominio
propio, tarifas, cotizador/link de reserva, pagos, calendario sincronizado con Airbnb/Booking (iCal)
y CRM básico de huéspedes — sin comisión por reserva. Cada alojamiento tiene su propia instalación aislada, con
3 meses de garantía y mantenimiento mensual ([ADR 0010](docs/adr/0010-installation-per-client.md)).

Este repositorio nace de **Saywa Lodges** (un lodge real en el Valle Sagrado, Urubamba), que hoy es
su primera instalación; internamente conserva el modelo multi-tenant (una organización por instalación). Roadmap completo y estado
de cada ticket: [`docs/roadmap.md`](docs/roadmap.md). Decisiones de arquitectura: [`docs/adr/`](docs/adr/).

## Stack

- **Next.js 16** (App Router, `proxy.ts`), **React 19**, TypeScript estricto, **Tailwind v4**.
- **Supabase**: Postgres (con RLS), Storage, Auth (desde Fase 1).
- **Vercel** para despliegue.

## Arquitectura (resumen)

- Multi-tenant por host: los sitios públicos se sirven en `app/sites/[host]/[lang]`.
  `proxy.ts` resuelve host e idioma y refresca cookies de sesión; la autorización vive en `lib/dal/`.
- Lecturas públicas con cliente `anon` en `lib/dal/public/`; el dashboard usa el cliente de sesión
  y comprueba membresía. RLS aísla los datos por organización.
- La service-role queda restringida a webhooks/cron/RPCs en `lib/supabase/admin.ts`.
- El contenido, espacios, servicios, distancias, fotos y logo se editan en `/app/site/*` con login.
  El panel antiguo y sus APIs se retiraron en SD-203.
- Las unidades reservables (casa completa o habitación), capacidades y estado se gestionan en
  `/app/site/units`; las inactivas se excluyen del inventario público para el futuro cotizador.
- Las tarifas publicadas siguen visibles, pero su edición desde la aplicación queda temporalmente
  pendiente hasta SD-207. El nuevo modelo y motor de precios se implementan en SD-205/206.
- El modelo de temporadas, tarifas y cargos se documenta en el [ADR 0005](docs/adr/0005-pricing-schema.md);
  el motor puro está en `lib/domain/pricing.ts`. El dashboard **Tarifas** (`/app/rates`, SD-207) permite
  editar temporadas, precios por unidad y cargos; el simulador recalcula con los importes guardados en el servidor.
  El adelanto del simulador es un escenario de prueba: no guarda una política ni crea reservas.
  La sección pública **Tarifas** (SD-208) muestra «desde {moneda} X» calculado en cada petición desde las
  tarifas numéricas de las unidades activas del tenant (`lib/domain/public-rates.ts`); la tabla `rate_tiers` ya no se lee.
- Las decisiones sobre dominios, RLS, prevención de dobles reservas y pagos están en los ADRs 0001–0004;
  consulta el roadmap para distinguir lo implementado de lo previsto.

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
cp .env.example .env.local   # completar con las credenciales locales de Supabase
npx supabase start            # levanta Postgres + Storage + Studio en Docker
```

`supabase start` imprime las credenciales locales (`API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`, …).
Para desarrollar **contra Supabase local**, usa `API_URL` como `SUPABASE_URL` y
`NEXT_PUBLIC_SUPABASE_URL`, `ANON_KEY` como `NEXT_PUBLIC_SUPABASE_ANON_KEY` y
`SERVICE_ROLE_KEY` como `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`.
No apuntes el entorno de desarrollo a producción.

```bash
npm run dev
```

Abre `http://saywa-lodges.localhost:3000/es` (o `/en`) para el sitio público,
`http://demo.localhost:3000/es` para la segunda organización (solo en local, para ver el aislamiento) y
`http://app.localhost:3000/login` para acceder al dashboard.
La raíz `http://localhost:3000` corresponde a la plataforma.

### Base de datos

El esquema vive versionado en `supabase/migrations/` (nunca se edita a mano la base remota — todo
cambio es un archivo de migración nuevo; ver `supabase/CLAUDE.md` y la skill `.claude/skills/db-migration`).

```bash
npx supabase db reset   # recrea la BD local desde las migraciones + supabase/seed.sql
```

`supabase/seed.sql` carga organizaciones de Saywa y demo, usuarios de desarrollo, espacios,
tarifas, servicios, distancias y referencias a fotos con prefijo `{org_id}/...`.
Para cargar los archivos de imagen en Storage local desde el historial de Git:

```bash
npm run db:seed-storage
```

Este script obtiene credenciales del stack local y rechaza destinos remotos.

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
| `npm run test:pricing` | Tests del motor y validadores de tarifas con cobertura (mínimo 90 % por archivo) |
| `npm run db:seed-storage` | Cargar imágenes en Storage local |

## Estado del proyecto

En desarrollo activo, siguiendo el roadmap por tickets (`SD-XXX`) en [`docs/roadmap.md`](docs/roadmap.md).
Convenciones de código y flujo de trabajo: [`CLAUDE.md`](CLAUDE.md).
