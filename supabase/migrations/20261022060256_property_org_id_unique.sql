-- SD-201 security review: lib/dal/property.ts#updatePropertySettings writes
-- via `update properties set ... where org_id = $1` — correct only as long
-- as the model is "1 org → at most 1 property". Nothing enforced that;
-- `properties_id_org_id_key` is unique(id, org_id), not unique(org_id). If
-- an org ever got a second property (e.g. a future SD-603 provisioning
-- bug), that write would silently touch both rows with the same data, and
-- the anon-facing getPropertySettings()'s .maybeSingle() would start
-- throwing "multiple rows" instead of failing clearly. Codifying the
-- current real invariant now, while it still holds for every row.
alter table "public"."properties"
  add constraint "properties_org_id_key" unique ("org_id");
