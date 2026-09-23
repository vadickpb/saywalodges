# ADR 0002 · Aislamiento de tenants con RLS y una capa de acceso a datos

- Estado: aceptado · Fecha: 2026-09-23

## Contexto
La versión single-tenant usaba la service-role key para todo; en multi-tenant, un filtro
olvidado filtraría datos de otro cliente (reservas, huéspedes, pagos).

## Decisión
Defensa en dos capas:
1. **Postgres RLS** en todas las tablas de negocio, cada una con `org_id` y políticas por operación
   basadas en `is_member(org_id)` (`security definer`, `search_path = ''`).
2. **DAL** (`lib/dal/*`, `server-only`): único lugar que importa clientes Supabase; verifica sesión
   y membresía antes de cada operación.

Clientes: anon (sitio público, solo contenido publicado), sesión de usuario (dashboard),
service-role solo en webhooks, cron y RPCs.

## Consecuencias
- Tests pgTAP de aislamiento obligatorios por tabla.
- Operaciones multi-tabla van en RPCs transaccionales.
- `org_id` se denormaliza en tablas hijas para políticas simples y rápidas.

## Alternativas descartadas
- Solo filtros en la aplicación: un error humano = fuga.
- Esquema o BD por tenant: complejidad operativa desproporcionada.
