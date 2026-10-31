# Reglas de base de datos

- Toda tabla de negocio: `org_id uuid not null references organizations`, índice sobre `org_id`.
- `alter table … enable row level security` en la misma migración que crea la tabla, con políticas
  explícitas por operación (`select`, `insert`, `update`, `delete`) usando `is_member(org_id)`.
- Funciones `security definer`: siempre `set search_path = ''` y nombres calificados (`public.tabla`).
- Dinero en `integer` (céntimos) + `currency`; estancias con `date` y `daterange` `[)`.
- Exclusiones de fechas con `btree_gist`.
- Nunca editar una migración ya mergeada a `main`: crear una nueva. Mientras el PR siga abierto, edita la
  misma migración en lugar de añadir otra (una migración por ticket) y repite `db reset` + `test db`.
- Cambios aditivos: el código se despliega antes que la BD, así que la migración no puede romper el código
  anterior (`drop`/`rename`/`not null` nuevos van en un ticket posterior).
- Crea la migración después de `git rebase origin/main` para que su timestamp sea posterior al de todo lo mergeado.
- Cada tabla nueva lleva un test pgTAP de aislamiento entre orgs en `supabase/tests/`;
  cada RPC y cada constraint, su propio test.
- Tras cambiar el esquema: `npx supabase db reset`, `npx supabase test db`, regenerar tipos.
- Producción se actualiza solo con el workflow *Deploy database* (aprobación del dueño); ver `docs/workflow.md`.
