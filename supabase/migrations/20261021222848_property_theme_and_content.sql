-- SD-209 (part 1): per-tenant theme and site copy for the public template.
--
-- Both are jsonb on purpose: their shape is owned by zod in the app
-- (lib/domain/site-theme.ts, lib/domain/site-content.ts), parsed on every
-- read, with anything invalid falling back to a preset/empty copy. The DB
-- only guarantees they're objects, so a malformed value can never reach the
-- schema parser as a string/array/null.
--
-- Not added to authenticated's column-level UPDATE grant (SD-102): nothing
-- writes these yet. The dashboard editor (SD-210) widens that grant together
-- with the zod-validated server action that actually uses it — no write
-- surface ships before the code that guards it.
--
-- Reversible: drop the two columns. Additive only, no backfill needed — the
-- existing table-level SELECT grant already covers new columns.

alter table "public"."properties"
  add column "theme" jsonb not null default '{}'::jsonb,
  add column "content" jsonb not null default '{}'::jsonb;

alter table "public"."properties"
  add constraint "properties_theme_is_object" check (jsonb_typeof("theme") = 'object'),
  add constraint "properties_content_is_object" check (jsonb_typeof("content") = 'object');
