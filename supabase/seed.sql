-- Local dev seed data for Saywa Lodges — loaded automatically by
-- `supabase db reset`. This is the real property content, dumped from the
-- live project with `supabase db dump --data-only` (see SD-002). It gives
-- local development the same content as production, without touching it.
--
-- SD-101 added org_id (not null) to every business table. Rather than
-- rewriting each VALUES row below (the original, unmodified dump), a
-- temporary column default fills it in; dropped again right after. Real
-- app code should never rely on this default — mutations always pass
-- org_id explicitly (see lib/dal/* from SD-104 onward).
INSERT INTO "public"."organizations" ("id", "name")
VALUES ('bf88f504-051f-4fdc-ab73-4fa12d715817', 'Saywa Lodges')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE "public"."properties" ALTER COLUMN "org_id" SET DEFAULT 'bf88f504-051f-4fdc-ab73-4fa12d715817';
ALTER TABLE "public"."spaces" ALTER COLUMN "org_id" SET DEFAULT 'bf88f504-051f-4fdc-ab73-4fa12d715817';
ALTER TABLE "public"."photos" ALTER COLUMN "org_id" SET DEFAULT 'bf88f504-051f-4fdc-ab73-4fa12d715817';
ALTER TABLE "public"."rate_tiers" ALTER COLUMN "org_id" SET DEFAULT 'bf88f504-051f-4fdc-ab73-4fa12d715817';
ALTER TABLE "public"."amenities" ALTER COLUMN "org_id" SET DEFAULT 'bf88f504-051f-4fdc-ab73-4fa12d715817';
ALTER TABLE "public"."distances" ALTER COLUMN "org_id" SET DEFAULT 'bf88f504-051f-4fdc-ab73-4fa12d715817';
ALTER TABLE "public"."properties" ALTER COLUMN "subdomain" SET DEFAULT 'saywa-lodges';

INSERT INTO "public"."properties"
  ("id", "slug", "name", "whatsapp_number", "whatsapp_message_en", "whatsapp_message_es",
   "email", "maps_url", "airbnb_url", "site_url", "created_at", "address_locality",
   "address_region", "address_country", "latitude", "longitude", "meta_title_en",
   "meta_title_es", "meta_description_en", "meta_description_es", "meta_keywords_en",
   "meta_keywords_es", "price_range", "star_rating", "pets_allowed", "logo_path")
VALUES
  ('131583b5-785e-4127-81f0-e097163c5654', 'saywa-lodges', 'Saywa Lodges', '51963416766',
   'Hi! I''m interested in booking Saywa Lodges in Valle Sagrado, Urubamba. Could you please share availability and rates?',
   'Hola! Me interesa reservar en Saywa Lodges en el Valle Sagrado, Urubamba. ¿Podrían compartirme disponibilidad y tarifas?',
   'reservas@saywalodges.com', 'https://maps.app.goo.gl/yQ9UMCuHZ6jZvxHJ9', '', 'https://saywalodges.com',
   '2026-09-03 16:09:58.399285+00', 'Urubamba', 'Cusco', 'PE', -13.3162, -72.1263,
   'Saywa Lodges · Valle Sagrado, Cusco, Perú', 'Saywa Lodges · Valle Sagrado, Cusco, Perú',
   'Private vacation lodge in Urubamba, Sacred Valley of the Incas. Private pool, Andean mountain views and access to Machu Picchu from $180/night.',
   'Lodge vacacional privado en Urubamba, Valle Sagrado de los Incas. Piscina privada, vistas a montañas andinas y acceso a Machu Picchu desde $180/noche.',
   '{"sacred valley lodge","vacation rental cusco","urubamba accommodation","private pool peru","near machu picchu","saywa lodges"}',
   '{"lodge valle sagrado","alquiler vacacional cusco","urubamba hospedaje","piscina privada peru","cerca machu picchu","saywa lodges"}',
   '$$', 4, false, NULL);

INSERT INTO "public"."spaces"
  ("id", "property_id", "key", "category", "icon", "capacity", "badge_en", "badge_es",
   "label_en", "label_es", "desc_en", "desc_es", "sort_order")
VALUES
  ('72e893c1-2512-4360-9244-361f1bd50c3f', '131583b5-785e-4127-81f0-e097163c5654', 'pool', 'pool', '🏊', NULL, NULL, NULL,
   'Heated Pool & Hot Tub', 'Piscina Temperada & Hidromasaje',
   'Covered heated pool with hot tub and panoramic views of the Sacred Valley mountains.',
   'Piscina cubierta y temperada con hidromasaje y vistas panorámicas a las montañas del Valle Sagrado.', 0),
  ('cd8f632d-6c96-4315-b0ed-2650c3b33a83', '131583b5-785e-4127-81f0-e097163c5654', 'suite', 'rooms', '🛏️', '2', NULL, NULL,
   'Patio Room', 'Habitación Patio',
   'Double bed, private bathroom with hot shower, and views of the patio and mountains. First floor.',
   'Cama de 2 plazas, baño privado con ducha de agua caliente y vista al patio y las montañas. Primer piso.', 1),
  ('31543e30-a762-4c86-8594-16fc4fcf5491', '131583b5-785e-4127-81f0-e097163c5654', 'queen-a', 'rooms', '🛏️', '2', NULL, NULL,
   'Panoramic Queen Room', 'Habitación Panorámica Queen',
   'Queen bed, private bathroom and terrace with panoramic mountain views. Second floor.',
   'Cama queen, baño privado y terraza con vista panorámica a las montañas. Segundo piso.', 2),
  ('78c0de2a-5ec7-472c-81ba-07e2711fcc91', '131583b5-785e-4127-81f0-e097163c5654', 'queen-b', 'rooms', '🛏️', '2', NULL, NULL,
   'Terrace Queen Room', 'Habitación Terraza Queen',
   'Queen bed, private bathroom, terrace and views of the mountains and patio. Second floor.',
   'Cama queen, baño privado, terraza y vista a las montañas y al patio. Segundo piso.', 3),
  ('cddc3758-65fb-4a7f-9a89-2505240f3aae', '131583b5-785e-4127-81f0-e097163c5654', 'queen-c', 'rooms', '🏔️', '3–4', 'Valley views', 'Vista al Valle',
   'Valley View Room', 'Habitación Mirador del Valle',
   '2 full-size beds, large panoramic window and access to a rooftop terrace with sweeping Sacred Valley views. Shared bathroom.',
   '2 camas de plaza y media, amplio ventanal tipo mirador y acceso a terraza superior con vista panorámica al Valle Sagrado. Baño compartido.', 4),
  ('aee44930-98b2-4709-8993-0a7b3085b9c3', '131583b5-785e-4127-81f0-e097163c5654', 'bunks', 'rooms', '👨‍👩‍👧‍👦', '5–6', 'Ideal for families', 'Ideal para familias',
   'Family Room with Bunks', 'Habitación Familiar con Literas',
   'Full-size bed plus 2 bunk beds, private bathroom, terrace and views of the patio and mountains. Ideal for families and groups.',
   'Cama de plaza y media, 2 literas, baño privado, terraza y vista al patio y las montañas. Ideal para familias, niños o grupos.', 5),
  ('7a0d6543-3cb4-4cd3-a602-8d586e104484', '131583b5-785e-4127-81f0-e097163c5654', 'living', 'common', '🏡', NULL, NULL, NULL,
   'Living & Dining Area', 'Sala & Comedor',
   'Cozy common area with Andean décor, dining table and fully equipped kitchen.',
   'Zona común acogedora con decoración andina, mesa de comedor y cocina completamente equipada.', 6),
  ('a4a71c65-7b77-48ae-8803-94f4f728342c', '131583b5-785e-4127-81f0-e097163c5654', 'garden', 'outdoor', '🌿', NULL, NULL, NULL,
   'Gardens & Green Fields', 'Jardines & Campo Verde',
   'Spacious green gardens with panoramic views of the Andean mountains.',
   'Amplios jardines verdes con vistas panorámicas a las montañas andinas.', 7),
  ('37ec69d5-035e-4d80-b5ce-4018ca08b29d', '131583b5-785e-4127-81f0-e097163c5654', 'bbq', 'outdoor', '🔥', NULL, NULL, NULL,
   'BBQ & Clay Oven', 'Parrilla & Horno de Barro',
   'Outdoor BBQ grill and traditional clay oven surrounded by the garden.',
   'Parrilla exterior y horno de barro tradicional rodeados por el jardín.', 8),
  ('616122c6-9370-4065-9c8e-9a7b251a45de', '131583b5-785e-4127-81f0-e097163c5654', 'exterior', 'outdoor', '🏔️', NULL, NULL, NULL,
   'Lodge Exterior', 'Exterior del Lodge',
   'Lodge exterior with Andean architecture, gardens and mountain backdrop.',
   'Exterior del lodge con arquitectura andina, jardines y montañas de fondo.', 9);

INSERT INTO "public"."amenities"
  ("id", "property_id", "icon", "title_en", "title_es", "desc_en", "desc_es", "sort_order")
VALUES
  ('45786ebf-4b4e-4f8c-8fe8-2916db11450e', '131583b5-785e-4127-81f0-e097163c5654', '🏊', 'Private Pool', 'Piscina Privada',
   'Exclusive pool with panoramic views of the Sacred Valley.', 'Piscina exclusiva con vistas panorámicas al Valle Sagrado.', 0),
  ('07d7981b-dbc2-45a5-8eb2-ddca3bd6e8ff', '131583b5-785e-4127-81f0-e097163c5654', '🍳', 'Full Kitchen', 'Cocina Completa',
   'Fully equipped kitchen with everything you need to cook your meals.', 'Cocina equipada con todo lo necesario para preparar tus comidas.', 1),
  ('d756951b-b0ce-41f2-a826-e9d451b4abbd', '131583b5-785e-4127-81f0-e097163c5654', '🏔️', 'Mountain Views', 'Vistas a Montañas',
   'Breathtaking Andean landscapes from every corner of the lodge.', 'Paisajes andinos imponentes desde cada rincón del lodge.', 2),
  ('791c4fff-8c13-4f45-9a04-fa9b5a874d2f', '131583b5-785e-4127-81f0-e097163c5654', '🏡', 'Private Lodge', 'Lodge Privado',
   'Exclusive property. Just for you and your companions.', 'Propiedad exclusiva. Solo para ti y tus acompañantes.', 3),
  ('67234a82-a4d5-4319-9f24-16a3d589afe9', '131583b5-785e-4127-81f0-e097163c5654', '🌄', 'Sacred Valley', 'Valle Sagrado',
   'In the heart of the Sacred Valley of the Incas, Urubamba.', 'En el corazón del Valle Sagrado de los Incas, Urubamba.', 4),
  ('7aa65219-daeb-41c6-928f-9ba92f9ea326', '131583b5-785e-4127-81f0-e097163c5654', '🗿', 'Near Machu Picchu', 'Cerca Machu Picchu',
   '1.5 hours from the world''s most famous citadel.', 'A 1.5 horas de la ciudadela más famosa del mundo.', 5);

INSERT INTO "public"."distances"
  ("id", "property_id", "place_en", "place_es", "time_en", "time_es", "icon", "sort_order")
VALUES
  ('2c4ab484-6dc9-4e7f-9ffa-e46ae7cc88c1', '131583b5-785e-4127-81f0-e097163c5654', 'Ollantaytambo', 'Ollantaytambo', '45 min', '45 min', '🚗', 0),
  ('f580baa5-8bfd-4d62-b433-b86508cc771d', '131583b5-785e-4127-81f0-e097163c5654', 'Cusco', 'Cusco', '2 hours', '2 horas', '🚗', 1),
  ('5b2dea5c-34fd-4058-ae29-26e68636ec4c', '131583b5-785e-4127-81f0-e097163c5654', 'Machu Picchu', 'Machu Picchu', '1.5 hours', '1.5 horas', '🚂', 2),
  ('1d4fbe42-c42d-4e05-aac4-5b0d13fc368b', '131583b5-785e-4127-81f0-e097163c5654', 'Pisac & Market', 'Pisac & Mercado', '25 min', '25 min', '🚗', 3),
  ('108a22f3-725e-4150-9790-9f4360112d78', '131583b5-785e-4127-81f0-e097163c5654', 'Urubamba River', 'Río Urubamba', '5 min', '5 min', '🚶', 4),
  ('68d1506b-5ed4-4c14-8bf1-7bcb6b8dee35', '131583b5-785e-4127-81f0-e097163c5654', 'Moray & Salt Mines', 'Moray & Salineras', '30 min', '30 min', '🚗', 5);

INSERT INTO "public"."rate_tiers"
  ("id", "property_id", "season_en", "season_es", "from_en", "from_es", "period_en", "period_es", "tag_en", "tag_es", "sort_order")
VALUES
  ('ff06a1b0-7542-4dc2-a96b-2e21c6ec469b', '131583b5-785e-4127-81f0-e097163c5654', 'Low season', 'Temporada baja', 'from USD 220', 'desde USD 220', 'per night', 'noche', '', '', 0),
  ('9a62b75f-fd1c-402c-ab83-e97ccf91bcf1', '131583b5-785e-4127-81f0-e097163c5654', 'High season', 'Temporada alta', 'from USD 300', 'desde USD 300', 'per night', 'noche', 'Jun – Sep', 'Jun – Sep', 1),
  ('64794e5a-c12e-48ab-9585-b4c97f690787', '131583b5-785e-4127-81f0-e097163c5654', 'Holidays & special dates', 'Feriados y fechas especiales', 'On request', 'Consultar', '', '', 'Subject to availability', 'Según disponibilidad', 2),
  ('8b5a688a-af58-44dc-92ad-aae575e2e270', '131583b5-785e-4127-81f0-e097163c5654', '7 nights or more', 'Estadías de 7 noches o más', 'Special rate', 'Tarifa especial', '', '', 'Extended stay', 'Estadía prolongada', 3);

-- Photos reference real storage paths. The files themselves aren't seeded by
-- `db reset`: run `npm run db:seed-storage` afterwards to upload them to the
-- local bucket (scripts/seed-local-storage.mjs, local stack only).
INSERT INTO "public"."photos"
  ("id", "property_id", "space_id", "storage_path", "role", "sort_order")
VALUES
  ('83505eca-dc0a-4fc1-b4b1-93896ead2530', '131583b5-785e-4127-81f0-e097163c5654', NULL, 'bf88f504-051f-4fdc-ab73-4fa12d715817/site/foto3.jpeg', 'hero', 0),
  ('9d60fcef-9d35-4011-80e0-8ea95e1102ee', '131583b5-785e-4127-81f0-e097163c5654', NULL, 'bf88f504-051f-4fdc-ab73-4fa12d715817/site/foto1.jpeg', 'gallery', 0),
  ('4ea98a66-fedb-452e-9316-23d41f0cd33a', '131583b5-785e-4127-81f0-e097163c5654', NULL, 'bf88f504-051f-4fdc-ab73-4fa12d715817/site/foto4.jpeg', 'gallery', 1),
  ('6dac8776-d935-4df4-9ddc-b26fbf6b46b8', '131583b5-785e-4127-81f0-e097163c5654', NULL, 'bf88f504-051f-4fdc-ab73-4fa12d715817/site/foto5.jpeg', 'gallery', 2),
  ('6500b521-7536-493e-a90e-f717cd7a8fed', '131583b5-785e-4127-81f0-e097163c5654', NULL, 'bf88f504-051f-4fdc-ab73-4fa12d715817/site/foto6.jpeg', 'gallery', 3),
  ('19d00e03-c770-4ee9-af8e-be846ced7fc9', '131583b5-785e-4127-81f0-e097163c5654', NULL, 'bf88f504-051f-4fdc-ab73-4fa12d715817/site/foto7.jpeg', 'gallery', 4),
  ('0c2dd19e-c6f0-4f06-a634-bfe3146326f3', '131583b5-785e-4127-81f0-e097163c5654', NULL, 'bf88f504-051f-4fdc-ab73-4fa12d715817/site/foto8.jpeg', 'gallery', 5),
  ('f3840536-e702-4e33-bee1-fadbe6813fc8', '131583b5-785e-4127-81f0-e097163c5654', '72e893c1-2512-4360-9244-361f1bd50c3f', 'bf88f504-051f-4fdc-ab73-4fa12d715817/spaces/pool/pool-01.jpeg', 'room', 0),
  ('9a0f5524-d681-482d-8a88-5e0a9f5735e7', '131583b5-785e-4127-81f0-e097163c5654', '72e893c1-2512-4360-9244-361f1bd50c3f', 'bf88f504-051f-4fdc-ab73-4fa12d715817/spaces/pool/pool-02.jpeg', 'room', 1),
  ('4566e19e-3d7a-4b13-a442-ca4f7f1cce6d', '131583b5-785e-4127-81f0-e097163c5654', '72e893c1-2512-4360-9244-361f1bd50c3f', 'bf88f504-051f-4fdc-ab73-4fa12d715817/spaces/pool/pool-03.jpeg', 'room', 2),
  ('a95bc068-1c17-4fb5-91c6-dfdfb63057a9', '131583b5-785e-4127-81f0-e097163c5654', 'cd8f632d-6c96-4315-b0ed-2650c3b33a83', 'bf88f504-051f-4fdc-ab73-4fa12d715817/spaces/suite/suite-01.jpeg', 'room', 0),
  ('50b0f8a3-76a7-4afc-8a0a-af222f60531b', '131583b5-785e-4127-81f0-e097163c5654', '31543e30-a762-4c86-8594-16fc4fcf5491', 'bf88f504-051f-4fdc-ab73-4fa12d715817/spaces/queen-a/queen-a-01.jpeg', 'room', 0),
  ('742c762f-ddf1-4e06-9b6a-a90b4aec7e8d', '131583b5-785e-4127-81f0-e097163c5654', '31543e30-a762-4c86-8594-16fc4fcf5491', 'bf88f504-051f-4fdc-ab73-4fa12d715817/spaces/queen-a/queen-a-02.jpeg', 'room', 1),
  ('dcf05676-d8df-42fa-8bbe-9d5bb389360a', '131583b5-785e-4127-81f0-e097163c5654', '78c0de2a-5ec7-472c-81ba-07e2711fcc91', 'bf88f504-051f-4fdc-ab73-4fa12d715817/spaces/queen-b/queen-b-01.jpeg', 'room', 0),
  ('cffcc44a-6240-4e56-b8f5-09a3d744e772', '131583b5-785e-4127-81f0-e097163c5654', '78c0de2a-5ec7-472c-81ba-07e2711fcc91', 'bf88f504-051f-4fdc-ab73-4fa12d715817/spaces/queen-b/queen-b-02.jpeg', 'room', 1),
  ('1d70e8ed-8192-481d-8298-d9724f9fdd9f', '131583b5-785e-4127-81f0-e097163c5654', 'cddc3758-65fb-4a7f-9a89-2505240f3aae', 'bf88f504-051f-4fdc-ab73-4fa12d715817/spaces/queen-c/queen-c-01.jpeg', 'room', 0),
  ('c185604a-3a27-444a-adce-d0614c878f05', '131583b5-785e-4127-81f0-e097163c5654', 'cddc3758-65fb-4a7f-9a89-2505240f3aae', 'bf88f504-051f-4fdc-ab73-4fa12d715817/spaces/queen-c/queen-c-02.jpeg', 'room', 1),
  ('5620f759-0fce-43e4-b42c-0f81fdd49db9', '131583b5-785e-4127-81f0-e097163c5654', 'aee44930-98b2-4709-8993-0a7b3085b9c3', 'bf88f504-051f-4fdc-ab73-4fa12d715817/spaces/bunks/bunks-01.jpeg', 'room', 0),
  ('e4b2b866-3eae-4b89-b87d-9c8e513f4c6d', '131583b5-785e-4127-81f0-e097163c5654', 'aee44930-98b2-4709-8993-0a7b3085b9c3', 'bf88f504-051f-4fdc-ab73-4fa12d715817/spaces/bunks/bunks-02.jpeg', 'room', 1),
  ('0bcf73ac-1c1d-4418-9982-2edde9a3e50c', '131583b5-785e-4127-81f0-e097163c5654', '7a0d6543-3cb4-4cd3-a602-8d586e104484', 'bf88f504-051f-4fdc-ab73-4fa12d715817/spaces/living/living-01.jpeg', 'room', 0),
  ('fbf9b207-dfea-440d-a2bd-76712c8997c6', '131583b5-785e-4127-81f0-e097163c5654', '7a0d6543-3cb4-4cd3-a602-8d586e104484', 'bf88f504-051f-4fdc-ab73-4fa12d715817/spaces/living/living-02.jpeg', 'room', 1),
  ('b8e9304c-cba9-4a7a-ac5e-209069c319b1', '131583b5-785e-4127-81f0-e097163c5654', '7a0d6543-3cb4-4cd3-a602-8d586e104484', 'bf88f504-051f-4fdc-ab73-4fa12d715817/spaces/living/living-03.jpeg', 'room', 2),
  ('a406ca1a-6ae1-4f17-8b53-dd0340e61bf3', '131583b5-785e-4127-81f0-e097163c5654', 'a4a71c65-7b77-48ae-8803-94f4f728342c', 'bf88f504-051f-4fdc-ab73-4fa12d715817/spaces/garden/garden-01.jpeg', 'room', 0),
  ('e93e93c3-a683-4626-8539-f9a270792eb6', '131583b5-785e-4127-81f0-e097163c5654', 'a4a71c65-7b77-48ae-8803-94f4f728342c', 'bf88f504-051f-4fdc-ab73-4fa12d715817/spaces/garden/garden-02.jpeg', 'room', 1),
  ('5d6e2721-da43-4b4e-9201-ca769efa0939', '131583b5-785e-4127-81f0-e097163c5654', 'a4a71c65-7b77-48ae-8803-94f4f728342c', 'bf88f504-051f-4fdc-ab73-4fa12d715817/spaces/garden/garden-03.jpeg', 'room', 2),
  ('1c503188-12bd-41e6-b642-2769fc6d1e68', '131583b5-785e-4127-81f0-e097163c5654', '37ec69d5-035e-4d80-b5ce-4018ca08b29d', 'bf88f504-051f-4fdc-ab73-4fa12d715817/spaces/bbq/bbq-01.jpeg', 'room', 0),
  ('eb2da880-0545-4ecb-9c7c-16e2f38ac06a', '131583b5-785e-4127-81f0-e097163c5654', '616122c6-9370-4065-9c8e-9a7b251a45de', 'bf88f504-051f-4fdc-ab73-4fa12d715817/spaces/exterior/exterior-01.jpeg', 'room', 0);

-- The property-photos bucket is created by migration 20261022203128.

-- Real app code must always pass org_id explicitly — drop the convenience
-- default now that the single-tenant rows above are seeded.
UPDATE "public"."properties" SET "published" = true WHERE "slug" = 'saywa-lodges';

-- SD-209: theme + site copy (shape owned by lib/domain/site-theme.ts and
-- lib/domain/site-content.ts). Copy moved verbatim from the old
-- dictionaries/; FAQ answers only state facts already in this file
-- (capacity, pets_allowed = false, distances) or the previous site copy.
UPDATE "public"."properties" SET
  "theme" = $j${"preset": "andino"}$j$::jsonb,
  "content" = $j${
    "region": {"en": "Sacred Valley · Urubamba · Cusco · Peru", "es": "Valle Sagrado · Urubamba · Cusco · Perú"},
    "headline": {"en": "Private country house in Urubamba", "es": "Casa de campo privada en Urubamba"},
    "tagline": {"en": "with heated pool, hot tub & mountain views", "es": "con piscina temperada, hidromasaje y vistas a montañas"},
    "intro": {
      "en": "An exclusive stay in the Sacred Valley, ideal for families and groups of up to 13 guests. Saywa Lodges features a heated covered pool with hot tub, spacious gardens, terrace bedrooms, BBQ area, clay oven and a prime location to explore Urubamba, Ollantaytambo and Machu Picchu.",
      "es": "Disfruta una estadía exclusiva en el Valle Sagrado, ideal para familias y grupos de hasta 13 personas. Saywa Lodges cuenta con piscina temperada/cubierta con hidromasaje, amplios jardines, habitaciones con terraza, zona de parrilla, horno de barro y una ubicación estratégica para visitar Urubamba, Ollantaytambo y Machu Picchu."
    },
    "highlights": [
      {"en": "Heated pool · Hot tub", "es": "Piscina temperada · Hidromasaje"},
      {"en": "Up to 13 guests", "es": "Hasta 13 personas"},
      {"en": "Gardens · BBQ · Clay oven", "es": "Jardines · Parrilla · Horno de barro"},
      {"en": "Sacred Valley", "es": "Valle Sagrado"}
    ],
    "capacity": 13,
    "spacesIntro": {
      "en": "The house has 5 rooms spread across different levels, designed for families and groups seeking comfort, privacy and Sacred Valley views. Most rooms have a private bathroom, terrace or mountain views.",
      "es": "La casa cuenta con 5 habitaciones en diferentes niveles, pensadas para familias y grupos. La mayoría cuenta con baño privado, terraza o vista a las montañas."
    },
    "locationBlurb": {
      "en": "Saywa Lodges is in Urubamba, at 2,800 m above sea level, surrounded by Andean mountains and along the sacred river — a privileged location connecting you to the main archaeological and historical sites of the Inca Sacred Valley.",
      "es": "Saywa Lodges se encuentra en Urubamba, a 2,800 msnm, rodeado de montañas andinas y a orillas del río sagrado. Una ubicación privilegiada que te conecta con los principales destinos arqueológicos e históricos del Valle Sagrado de los Incas."
    },
    "faq": [
      {"question": {"en": "How many guests can stay?", "es": "¿Cuántas personas pueden hospedarse?"},
       "answer": {"en": "Up to 13 guests. The house is rented as a whole — completely private for you and your group.", "es": "Hasta 13 personas. La casa se alquila completa: es totalmente privada para ti y tu grupo."}},
      {"question": {"en": "Is the pool heated?", "es": "¿La piscina es temperada?"},
       "answer": {"en": "Yes — it's a covered, heated pool with a hot tub.", "es": "Sí, es una piscina cubierta y temperada, con hidromasaje."}},
      {"question": {"en": "How far is Machu Picchu?", "es": "¿Qué tan lejos está Machu Picchu?"},
       "answer": {"en": "Ollantaytambo, where the train to Machu Picchu departs, is 45 minutes away by car.", "es": "Ollantaytambo, de donde sale el tren a Machu Picchu, está a 45 minutos en auto."}},
      {"question": {"en": "Are pets allowed?", "es": "¿Se aceptan mascotas?"},
       "answer": {"en": "No, pets aren't allowed at the property.", "es": "No, no se aceptan mascotas en la propiedad."}},
      {"question": {"en": "How do I book?", "es": "¿Cómo reservo?"},
       "answer": {"en": "Write to us on WhatsApp with your dates and group size — we reply within 2 hours with availability and your rate.", "es": "Escríbenos por WhatsApp con tus fechas y el número de personas: respondemos en menos de 2 horas con disponibilidad y tu tarifa."}}
    ]
  }$j$::jsonb
WHERE "slug" = 'saywa-lodges';

ALTER TABLE "public"."properties" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "public"."spaces" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "public"."photos" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "public"."rate_tiers" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "public"."amenities" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "public"."distances" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "public"."properties" ALTER COLUMN "subdomain" DROP DEFAULT;

-- ─── Demo tenant (SD-101) ────────────────────────────────────────────────────
-- A second, independent org + property, purely for exercising multi-tenant
-- isolation locally (pgTAP here, host-based routing from SD-105 on). Content
-- is deliberately minimal placeholder text, not real business data.

INSERT INTO "public"."organizations" ("id", "name")
VALUES ('ff24bacc-47d2-40bc-9210-f860e98892fd', 'Demo Org');

INSERT INTO "public"."properties"
  ("id", "org_id", "slug", "name", "whatsapp_number", "email", "subdomain", "published",
   "address_locality", "address_region", "address_country", "price_range")
VALUES
  ('57f914ac-3890-47c1-9d6d-1492782cf712', 'ff24bacc-47d2-40bc-9210-f860e98892fd', 'demo', 'Demo Lodge',
   '51900000000', 'demo@example.com', 'demo', true, 'Lima', 'Lima', 'PE', '$');

INSERT INTO "public"."spaces"
  ("id", "org_id", "property_id", "key", "category", "icon", "label_en", "label_es", "desc_en", "desc_es", "sort_order")
VALUES
  ('b2e1a0b1-7a7e-4f2a-8c9a-0b1c2d3e4f5a', 'ff24bacc-47d2-40bc-9210-f860e98892fd', '57f914ac-3890-47c1-9d6d-1492782cf712',
   'demo-room', 'rooms', '🛏️', 'Demo Room', 'Habitación Demo', 'Placeholder room for local testing.', 'Habitación de ejemplo para pruebas locales.', 0);

INSERT INTO "public"."amenities"
  ("id", "org_id", "property_id", "icon", "title_en", "title_es", "desc_en", "desc_es", "sort_order")
VALUES
  ('c3f2b1c2-8b8f-4a3b-9d0b-1c2d3e4f5a6b', 'ff24bacc-47d2-40bc-9210-f860e98892fd', '57f914ac-3890-47c1-9d6d-1492782cf712',
   '📶', 'Wi-Fi', 'Wi-Fi', 'Placeholder amenity.', 'Amenity de ejemplo.', 0);

-- SD-209: a different preset than Saywa, so the two tenants visibly prove the
-- theme comes from the database. Photos reuse Saywa's files under the demo org prefix
-- paths (seed-local-storage.mjs strips the org prefix to find the source).
UPDATE "public"."properties" SET
  "theme" = $j${"preset": "costa"}$j$::jsonb,
  "content" = $j${
    "region": {"en": "Demo · Lima · Peru", "es": "Demo · Lima · Perú"},
    "headline": {"en": "A demo lodge for Saywa Direct", "es": "Un alojamiento demo de Saywa Direct"},
    "tagline": {"en": "Sample content to preview the site template", "es": "Contenido de ejemplo para previsualizar la plantilla"},
    "intro": {
      "en": "This is placeholder copy for the demo tenant. Every lodge on Saywa Direct writes its own description, picks its colors and uploads its photos.",
      "es": "Este es un texto de ejemplo del tenant demo. Cada alojamiento en Saywa Direct escribe su propia descripción, elige sus colores y sube sus fotos."
    },
    "highlights": [
      {"en": "Sample highlight", "es": "Destacado de ejemplo"},
      {"en": "Up to 4 guests", "es": "Hasta 4 personas"}
    ],
    "capacity": 4,
    "faq": [
      {"question": {"en": "Is this a real lodge?", "es": "¿Es un alojamiento real?"},
       "answer": {"en": "No — it's demo data for local development.", "es": "No, son datos de ejemplo para desarrollo local."}}
    ]
  }$j$::jsonb
WHERE "id" = '57f914ac-3890-47c1-9d6d-1492782cf712';

INSERT INTO "public"."photos"
  ("id", "org_id", "property_id", "space_id", "storage_path", "role", "sort_order")
VALUES
  ('d1a0c3e2-5b6f-4c7d-8e9f-0a1b2c3d4e01', 'ff24bacc-47d2-40bc-9210-f860e98892fd', '57f914ac-3890-47c1-9d6d-1492782cf712', NULL, 'ff24bacc-47d2-40bc-9210-f860e98892fd/site/foto1.jpeg', 'hero', 0),
  ('d1a0c3e2-5b6f-4c7d-8e9f-0a1b2c3d4e02', 'ff24bacc-47d2-40bc-9210-f860e98892fd', '57f914ac-3890-47c1-9d6d-1492782cf712', NULL, 'ff24bacc-47d2-40bc-9210-f860e98892fd/site/foto5.jpeg', 'gallery', 0),
  ('d1a0c3e2-5b6f-4c7d-8e9f-0a1b2c3d4e03', 'ff24bacc-47d2-40bc-9210-f860e98892fd', '57f914ac-3890-47c1-9d6d-1492782cf712', NULL, 'ff24bacc-47d2-40bc-9210-f860e98892fd/site/foto6.jpeg', 'gallery', 1),
  ('d1a0c3e2-5b6f-4c7d-8e9f-0a1b2c3d4e04', 'ff24bacc-47d2-40bc-9210-f860e98892fd', '57f914ac-3890-47c1-9d6d-1492782cf712', NULL, 'ff24bacc-47d2-40bc-9210-f860e98892fd/site/foto7.jpeg', 'gallery', 2),
  ('d1a0c3e2-5b6f-4c7d-8e9f-0a1b2c3d4e05', 'ff24bacc-47d2-40bc-9210-f860e98892fd', '57f914ac-3890-47c1-9d6d-1492782cf712', NULL, 'ff24bacc-47d2-40bc-9210-f860e98892fd/site/foto8.jpeg', 'gallery', 3),
  ('d1a0c3e2-5b6f-4c7d-8e9f-0a1b2c3d4e06', 'ff24bacc-47d2-40bc-9210-f860e98892fd', '57f914ac-3890-47c1-9d6d-1492782cf712', 'b2e1a0b1-7a7e-4f2a-8c9a-0b1c2d3e4f5a', 'ff24bacc-47d2-40bc-9210-f860e98892fd/spaces/suite/suite-01.jpeg', 'room', 0);

-- ─── Local-only auth users + memberships (SD-101) ───────────────────────────
-- Passwords are fixed, publicly-known dev credentials — fine today because
-- this file only ever runs against the local Supabase stack (`supabase db
-- reset`); Claude has no access to run it against the remote project
-- (db push / link are denied — see .claude/settings.json), and Supabase
-- Branching is not enabled on this project (verified: no branches).
-- No password here would be safe if that ever changes: this file is
-- committed to a public-by-default repo, so any credential in it is
-- public by definition. Before ever enabling Branching (which runs
-- seed.sql on internet-reachable preview databases), these seeded users
-- and the real Saywa Lodges content copied into this file need a
-- different plan — e.g. a separate, gitignored local-only seed, or
-- branch-specific seeding that excludes real data and real-looking
-- credentials entirely. Not usable for real sign-in until SD-103 wires
-- up Supabase Auth in the app.

INSERT INTO "auth"."users" (
  "instance_id", "id", "aud", "role", "email", "encrypted_password",
  "email_confirmed_at", "raw_app_meta_data", "raw_user_meta_data",
  "created_at", "updated_at", "confirmation_token", "email_change",
  "email_change_token_new", "recovery_token"
) VALUES
  ('00000000-0000-0000-0000-000000000000', 'a3b45db1-7c15-4528-a4ba-be625665fb6d', 'authenticated', 'authenticated',
   'owner@saywalodges.com', crypt('devpassword123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'bd6a1c86-01e2-40a4-ba79-4e28b373e880', 'authenticated', 'authenticated',
   'owner@demo.saywadirect.test', crypt('devpassword123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

INSERT INTO "auth"."identities" (
  "id", "user_id", "identity_data", "provider", "provider_id", "last_sign_in_at", "created_at", "updated_at"
) VALUES
  ('b62f1d19-322d-4fad-b8ba-54802f4b720e', 'a3b45db1-7c15-4528-a4ba-be625665fb6d',
   '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d","email":"owner@saywalodges.com"}'::jsonb,
   'email', 'a3b45db1-7c15-4528-a4ba-be625665fb6d', now(), now(), now()),
  ('889e1602-ef22-492b-9c1c-fbd4d1a131b0', 'bd6a1c86-01e2-40a4-ba79-4e28b373e880',
   '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880","email":"owner@demo.saywadirect.test"}'::jsonb,
   'email', 'bd6a1c86-01e2-40a4-ba79-4e28b373e880', now(), now(), now());

INSERT INTO "public"."memberships" ("org_id", "user_id", "role")
VALUES
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', 'a3b45db1-7c15-4528-a4ba-be625665fb6d', 'owner'),
  ('ff24bacc-47d2-40bc-9210-f860e98892fd', 'bd6a1c86-01e2-40a4-ba79-4e28b373e880', 'owner');

-- SD-204: bookable inventory, not the spaces shown in the photo gallery.
-- Local examples only. Included guests equals capacity until real rates are
-- configured in SD-205/207; this is not a production pricing decision.
INSERT INTO public.units (id, org_id, property_id, name, kind, max_guests, included_guests, active)
VALUES
  ('ee204001-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Saywa Lodges — Casa completa', 'entire_place', 13, 13, true),
  ('ee204001-0000-4000-8000-000000000002', 'ff24bacc-47d2-40bc-9210-f860e98892fd', '57f914ac-3890-47c1-9d6d-1492782cf712', 'Demo — Habitación', 'room', 4, 2, true);

-- SD-205: local examples, never a production price import. Saywa's old
-- published tiers say USD 220 low / USD 300 high (June–September). The year
-- 2027 is an explicit local fixture, not a confirmed future operating season.
-- Migration backfills existing production rows; a fresh local reset inserts
-- the properties afterwards, so seed the known currency explicitly too.
UPDATE public.properties SET currency = 'USD' WHERE slug = 'saywa-lodges';
-- Holiday dates/prices are still "on request": do not invent a Saywa rate.
-- The demo holiday and fee below are synthetic examples, not Saywa prices.
INSERT INTO public.seasons (id, org_id, property_id, name, start_date, end_date, priority)
VALUES
  ('ee205001-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Temporada alta (ejemplo local 2027)', '2027-06-01', '2027-10-01', 10),
  ('ee205001-0000-4000-8000-000000000002', 'ff24bacc-47d2-40bc-9210-f860e98892fd', '57f914ac-3890-47c1-9d6d-1492782cf712', 'Feriado demo (ejemplo ficticio)', '2027-07-28', '2027-07-30', 20);

INSERT INTO public.unit_rates (id, org_id, property_id, unit_id, season_id, nightly_cents, weekend_nightly_cents, extra_guest_cents, min_nights)
VALUES
  ('ee205002-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001', NULL, 22000, NULL, 0, 1),
  ('ee205002-0000-4000-8000-000000000002', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001', 'ee205001-0000-4000-8000-000000000001', 30000, NULL, 0, 1),
  ('ee205002-0000-4000-8000-000000000003', 'ff24bacc-47d2-40bc-9210-f860e98892fd', '57f914ac-3890-47c1-9d6d-1492782cf712', 'ee204001-0000-4000-8000-000000000002', NULL, 10000, 12000, 2500, 1),
  ('ee205002-0000-4000-8000-000000000004', 'ff24bacc-47d2-40bc-9210-f860e98892fd', '57f914ac-3890-47c1-9d6d-1492782cf712', 'ee204001-0000-4000-8000-000000000002', 'ee205001-0000-4000-8000-000000000002', 15000, NULL, 2500, 2);

INSERT INTO public.fees (id, org_id, property_id, unit_id, name, kind, amount_cents)
VALUES ('ee205003-0000-4000-8000-000000000001', 'ff24bacc-47d2-40bc-9210-f860e98892fd', '57f914ac-3890-47c1-9d6d-1492782cf712', 'ee204001-0000-4000-8000-000000000002', 'Limpieza demo (ejemplo ficticio)', 'per_stay', 5000);
