CREATE TABLE "public"."amenities" (
  "id"          uuid    NOT NULL DEFAULT gen_random_uuid(),
  "property_id" uuid    NOT NULL,
  "icon"        text    NOT NULL DEFAULT ''::text,
  "title_en"    text    NOT NULL,
  "title_es"    text    NOT NULL,
  "desc_en"     text    NOT NULL DEFAULT ''::text,
  "desc_es"     text    NOT NULL DEFAULT ''::text,
  "sort_order"  integer NOT NULL DEFAULT 0,
  CONSTRAINT "amenities_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."amenities"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."distances" (
  "id"          uuid    NOT NULL DEFAULT gen_random_uuid(),
  "property_id" uuid    NOT NULL,
  "place_en"    text    NOT NULL,
  "place_es"    text    NOT NULL,
  "time_en"     text    NOT NULL,
  "time_es"     text    NOT NULL,
  "icon"        text    NOT NULL DEFAULT ''::text,
  "sort_order"  integer NOT NULL DEFAULT 0,
  CONSTRAINT "distances_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."distances"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."photos" (
  "id"           uuid    NOT NULL DEFAULT gen_random_uuid(),
  "property_id"  uuid    NOT NULL,
  "room_id"      uuid,
  "storage_path" text    NOT NULL,
  "sort_order"   integer NOT NULL DEFAULT 0,
  CONSTRAINT "photos_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."photos"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."properties" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "slug"                text                     NOT NULL,
  "name"                text                     NOT NULL,
  "whatsapp_number"     text                     NOT NULL,
  "whatsapp_message_en" text                     NOT NULL DEFAULT ''::text,
  "whatsapp_message_es" text                     NOT NULL DEFAULT ''::text,
  "email"               text                     NOT NULL DEFAULT ''::text,
  "maps_url"            text                     NOT NULL DEFAULT ''::text,
  "airbnb_url"          text                     NOT NULL DEFAULT ''::text,
  "site_url"            text                     NOT NULL DEFAULT ''::text,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "address_locality"    text                     NOT NULL DEFAULT ''::text,
  "address_region"      text                     NOT NULL DEFAULT ''::text,
  "address_country"     text                     NOT NULL DEFAULT ''::text,
  "latitude"            double precision,
  "longitude"           double precision,
  "meta_title_en"       text                     NOT NULL DEFAULT ''::text,
  "meta_title_es"       text                     NOT NULL DEFAULT ''::text,
  "meta_description_en" text                     NOT NULL DEFAULT ''::text,
  "meta_description_es" text                     NOT NULL DEFAULT ''::text,
  "meta_keywords_en"    text[]                   NOT NULL DEFAULT '{}'::text[],
  "meta_keywords_es"    text[]                   NOT NULL DEFAULT '{}'::text[],
  "price_range"         text                     NOT NULL DEFAULT ''::text,
  "star_rating"         numeric,
  "pets_allowed"        boolean                  NOT NULL DEFAULT false,
  "logo_path"           text,
  CONSTRAINT "properties_pkey" PRIMARY KEY (id),
  CONSTRAINT "properties_slug_key" UNIQUE (slug)
);

ALTER TABLE "public"."properties"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."rate_tiers" (
  "id"          uuid    NOT NULL DEFAULT gen_random_uuid(),
  "property_id" uuid    NOT NULL,
  "season_en"   text    NOT NULL,
  "season_es"   text    NOT NULL,
  "from_en"     text    NOT NULL,
  "from_es"     text    NOT NULL,
  "period_en"   text    NOT NULL DEFAULT ''::text,
  "period_es"   text    NOT NULL DEFAULT ''::text,
  "tag_en"      text    NOT NULL DEFAULT ''::text,
  "tag_es"      text    NOT NULL DEFAULT ''::text,
  "sort_order"  integer NOT NULL DEFAULT 0,
  CONSTRAINT "rate_tiers_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."rate_tiers"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."rooms" (
  "id"          uuid    NOT NULL DEFAULT gen_random_uuid(),
  "property_id" uuid    NOT NULL,
  "key"         text    NOT NULL,
  "icon"        text    NOT NULL DEFAULT ''::text,
  "capacity"    text,
  "badge_en"    text,
  "badge_es"    text,
  "label_en"    text    NOT NULL,
  "label_es"    text    NOT NULL,
  "desc_en"     text    NOT NULL DEFAULT ''::text,
  "desc_es"     text    NOT NULL DEFAULT ''::text,
  "sort_order"  integer NOT NULL DEFAULT 0,
  CONSTRAINT "rooms_pkey" PRIMARY KEY (id),
  CONSTRAINT "rooms_property_id_key_key" UNIQUE (property_id, key)
);

ALTER TABLE "public"."rooms"
  ENABLE ROW LEVEL SECURITY;

CREATE TYPE "public"."photo_role" AS ENUM (
  'hero',
  'gallery',
  'room'
);

ALTER TABLE "public"."photos"
  ADD COLUMN "role" public.photo_role NOT NULL;

CREATE TYPE "public"."room_category" AS ENUM (
  'pool',
  'rooms',
  'common',
  'outdoor'
);

ALTER TABLE "public"."rooms"
  ADD COLUMN "category" public.room_category NOT NULL;

ALTER TABLE "public"."amenities"
  ADD CONSTRAINT "amenities_property_id_fkey" FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;

ALTER TABLE "public"."distances"
  ADD CONSTRAINT "distances_property_id_fkey" FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;

ALTER TABLE "public"."photos"
  ADD CONSTRAINT "photos_property_id_fkey" FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;

ALTER TABLE "public"."rate_tiers"
  ADD CONSTRAINT "rate_tiers_property_id_fkey" FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;

ALTER TABLE "public"."photos"
  ADD CONSTRAINT "photos_room_id_fkey" FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE CASCADE;

ALTER TABLE "public"."rooms"
  ADD CONSTRAINT "rooms_property_id_fkey" FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."amenities" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."amenities" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."amenities" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."amenities" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."distances" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."distances" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."distances" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."distances" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."photos" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."photos" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."photos" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."photos" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."properties" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."properties" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."properties" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."properties" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."rate_tiers" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."rate_tiers" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."rate_tiers" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."rate_tiers" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."rooms" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."rooms" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."rooms" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."rooms" TO "service_role";

