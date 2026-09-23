# Reglas de base de datos

- Toda tabla de negocio: `org_id uuid not null references organizations`, índice sobre `org_id`.
- `alter table … enable row level security` en la misma migración que crea la tabla, con políticas
  explícitas por operación (`select`, `insert`, `update`, `delete`) usando `is_member(org_id)`.
- Funciones `security definer`: siempre `set search_path = ''` y nombres calificados (`public.tabla`).
- Dinero en `integer` (céntimos) + `currency`; estancias con `date` y `daterange` `[)`.
- Exclusiones de fechas con `btree_gist`.
- Nunca editar una migración ya mergeada a `main`: crear una nueva.
- Cada tabla nueva lleva un test pgTAP de aislamiento entre orgs en `supabase/tests/`;
  cada RPC y cada constraint, su propio test.
- Tras cambiar el esquema: `npx supabase db reset`, `npx supabase test db`, regenerar tipos.
