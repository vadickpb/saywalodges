@AGENTS.md

# Saywa Direct

SaaS multi-tenant de reservas directas para alojamientos independientes en Perú.
Stack: Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript strict, Tailwind v4,
Supabase (Postgres + RLS, Auth, Storage), Vercel.
Roadmap y tickets: `docs/roadmap.md`. Decisiones de arquitectura: `docs/adr/`.

## Comandos

- `npm run dev` · `npm run lint` · `npm run typecheck` · `npm run test` · `npm run build`
- `npx supabase start` · `npx supabase db reset` · `npx supabase test db` · `npx supabase gen types`
- Dev multi-tenant: `saywa-lodges.localhost:3000`, `demo.localhost:3000`, `app.localhost:3000`

## Arquitectura (no negociable)

- Tenant = `organization`. Toda tabla de negocio tiene `org_id` y RLS habilitado.
- Sitios públicos en `app/sites/[host]/[lang]`; dashboard en `app/app/(dashboard)`.
  `proxy.ts` solo reescribe por host e idioma: nunca consulta la BD ni autoriza.
- Todo acceso a datos pasa por `lib/dal/*` (`import "server-only"`), que verifica sesión y membresía.
- La service-role key (`lib/supabase/admin.ts`) solo se usa en webhooks, cron y RPCs.
  Nunca en páginas ni en server actions de usuario.
- Mutaciones: server action + validación zod. Operaciones multi-tabla: RPC transaccional en Postgres.
- Los precios los calcula siempre el servidor (`lib/domain/pricing.ts`). Nunca aceptar montos del cliente.
- Dinero: enteros en céntimos + `currency` (`PEN` | `USD`). Estancias: tipo `date`,
  rango `[check_in, check_out)`, zona `America/Lima`.
- La doble reserva la impide el exclusion constraint de `calendar_blocks`; no reimplementarla en la app.

## Convenciones

- Código, identificadores y commits en inglés. UI en es/en vía `dictionaries/`. Documentación en español.
- Lógica de negocio pura (sin I/O) en `lib/domain/`. Componentes: `components/site` (sitio del tenant),
  `components/dashboard`, `components/ui` (primitivas shadcn/ui).
- Prohibido `any` y `as` para "validar" input externo: usar zod.
- Nunca devolver `error.message` de la BD al cliente; loguear en servidor y responder un error genérico.
- Leer la guía relevante en `node_modules/next/dist/docs/` antes de usar una API de Next.
- No añadir dependencias sin justificarlas en el PR.

## Base de datos

- Cambios solo mediante archivos en `supabase/migrations/` (skill `db-migration`).
- Claude nunca modifica la BD remota (ni `supabase db push` ni tools MCP de escritura).

## Flujo de trabajo

- Cada ticket sigue la skill `ticket`; los tests, la skill `testing`.
- Delegación a subagentes (autorizada por este archivo):
  - `reviewer`: siempre, al terminar un ticket y antes de abrir el PR.
  - `security-reviewer`: en paralelo con `reviewer` si el diff toca migraciones/RLS/RPCs,
    `lib/dal`, `lib/supabase`, `proxy.ts`/auth, pagos/webhooks, uploads/Storage, `lib/ical`,
    server actions públicas o variables de entorno.
  - Los revisores no editan; el agente principal aplica los arreglos.
  - No delegar implementación ni búsquedas que se resuelven leyendo 2–3 archivos.
- Commits: Conventional Commits `type(scope): subject` (feat, fix, refactor, test, chore, docs).
  Un PR por ticket, rama `<type>/<ticket-id>-slug`, squash merge.
