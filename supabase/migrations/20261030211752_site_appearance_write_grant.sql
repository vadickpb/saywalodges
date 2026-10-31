-- SD-210: the dashboard "Sitio → Apariencia" editor writes properties.theme
-- and properties.content (added read-only in SD-209).
--
-- Additive: a column-level UPDATE grant for `authenticated` only. `anon`
-- stays read-only. Row access is unchanged — the existing properties_update
-- policy (is_member(org_id) in using and with check) still filters every row,
-- so a member can only ever change their own org's property. The columns
-- that must stay off-limits (id, org_id, slug, subdomain, custom_domain) are
-- still not granted. Shape validation lives in the server action (zod, same
-- schemas as lib/domain/site-theme.ts and site-content.ts); the DB keeps its
-- "must be a jsonb object" check constraints from SD-209.
--
-- Reversible: revoke update ("theme", "content") on public.properties from
-- authenticated. No backfill, no data change.

grant update ("theme", "content") on table "public"."properties" to "authenticated";
