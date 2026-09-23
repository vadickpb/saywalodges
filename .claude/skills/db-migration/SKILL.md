---
name: db-migration
description: Procedimiento para crear o modificar el esquema de Supabase en Saywa Direct (migración, RLS, índices, RPCs, tests pgTAP, tipos). Usar siempre que un cambio toque tablas, políticas, funciones, triggers o Storage.
---

# Migración de base de datos

Reglas base: `supabase/CLAUDE.md`. Nunca tocar la BD remota: todo cambio es un archivo de migración
que llega a producción por CI.

## Pasos

1. `npx supabase migration new <slug_descriptivo>` (no crear el archivo a mano).
2. Escribe la migración en este orden:
   1. Tipos/enums.
   2. Tablas con `id uuid primary key default gen_random_uuid()`, `org_id`, `created_at`,
      `updated_at`, FKs con `on delete` explícito, `check` constraints.
   3. Índices (siempre `org_id` y las FKs que se consultan).
   4. `enable row level security` + una política por operación.
   5. Funciones/RPCs (`security definer` solo si es necesario, con `set search_path = ''`
      y comprobación de `is_member()` dentro).
   6. `grant`/`revoke` explícitos si la función no debe ser invocable por `anon`.
3. Datos de ejemplo necesarios en `supabase/seed.sql` (dos orgs: `saywa-lodges` y `demo`).
4. Tests pgTAP en `supabase/tests/<slug>.test.sql`:
   - usuario de org A ve/edita lo suyo; no ve ni edita lo de org B; `anon` solo lo público;
   - cada constraint relevante (p. ej. exclusión de fechas) y cada RPC (caso feliz + rechazo).
5. `npx supabase db reset && npx supabase test db` en verde.
6. Regenera tipos: `npx supabase gen types typescript --local > lib/supabase/database.types.ts`.
7. Adapta la DAL a los tipos nuevos; `npm run typecheck`.

## Checklist antes de dar por terminado
- [ ] ¿La migración es reversible o está documentado por qué no?
- [ ] ¿Cambios destructivos (drop/rename) tienen plan de backfill y compatibilidad con el código desplegado?
- [ ] ¿Ninguna tabla nueva queda sin RLS?
- [ ] ¿El ticket activará `security-reviewer`? (siempre que haya migración: sí)
