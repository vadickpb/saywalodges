-- SD-202: rooms -> spaces. A "space" is any area guests can see (pool, garden,
-- bedrooms, ...), not only rooms. Pure rename: ALTER ... RENAME keeps data,
-- grants, RLS and policy bodies, so the policy/constraint/index names are
-- renamed below only to keep `rooms_*` from lingering.
--
-- NOT backwards compatible with code that still queries `rooms`: deploy the
-- app version that uses `spaces` together with (or immediately after) this
-- migration. photos.role keeps the enum value 'room' (it means "space photo").

alter type "public"."room_category" rename to "space_category";
alter table "public"."rooms" rename to "spaces";
alter table "public"."photos" rename column "room_id" to "space_id";

alter table "public"."spaces" rename constraint "rooms_pkey" to "spaces_pkey";
alter table "public"."spaces" rename constraint "rooms_property_id_key_key" to "spaces_property_id_key_key";
alter table "public"."spaces" rename constraint "rooms_org_id_fkey" to "spaces_org_id_fkey";
alter table "public"."spaces" rename constraint "rooms_property_id_org_id_fkey" to "spaces_property_id_org_id_fkey";
alter table "public"."spaces" rename constraint "rooms_id_property_id_key" to "spaces_id_property_id_key";
alter table "public"."photos" rename constraint "photos_room_id_property_id_fkey" to "photos_space_id_property_id_fkey";
alter index "public"."rooms_org_id_idx" rename to "spaces_org_id_idx";

alter policy "rooms_select" on "public"."spaces" rename to "spaces_select";
alter policy "rooms_insert" on "public"."spaces" rename to "spaces_insert";
alter policy "rooms_update" on "public"."spaces" rename to "spaces_update";
alter policy "rooms_delete" on "public"."spaces" rename to "spaces_delete";
