-- Local dev seed data for Saywa Lodges — loaded automatically by
-- `supabase db reset`. This is the real property content, dumped from the
-- live project with `supabase db dump --data-only` (see SD-002). It gives
-- local development the same content as production, without touching it.
--
-- Single-tenant for now (no org_id yet — see Fase 1, SD-101/SD-102).

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

INSERT INTO "public"."rooms"
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

-- Photos reference real storage paths. They resolve locally too, since the
-- storage bucket below is public and local Storage proxies the same object
-- keys — but the actual files only exist in the remote bucket. Local dev
-- will see broken images for photos until SD-202 adds a way to seed Storage
-- objects locally; the rows themselves (counts, ordering, room linkage) are
-- what matters for working on everything other than the images.
INSERT INTO "public"."photos"
  ("id", "property_id", "room_id", "storage_path", "role", "sort_order")
VALUES
  ('83505eca-dc0a-4fc1-b4b1-93896ead2530', '131583b5-785e-4127-81f0-e097163c5654', NULL, 'site/foto3.jpeg', 'hero', 0),
  ('9d60fcef-9d35-4011-80e0-8ea95e1102ee', '131583b5-785e-4127-81f0-e097163c5654', NULL, 'site/foto1.jpeg', 'gallery', 0),
  ('4ea98a66-fedb-452e-9316-23d41f0cd33a', '131583b5-785e-4127-81f0-e097163c5654', NULL, 'site/foto4.jpeg', 'gallery', 1),
  ('6dac8776-d935-4df4-9ddc-b26fbf6b46b8', '131583b5-785e-4127-81f0-e097163c5654', NULL, 'site/foto5.jpeg', 'gallery', 2),
  ('6500b521-7536-493e-a90e-f717cd7a8fed', '131583b5-785e-4127-81f0-e097163c5654', NULL, 'site/foto6.jpeg', 'gallery', 3),
  ('19d00e03-c770-4ee9-af8e-be846ced7fc9', '131583b5-785e-4127-81f0-e097163c5654', NULL, 'site/foto7.jpeg', 'gallery', 4),
  ('0c2dd19e-c6f0-4f06-a634-bfe3146326f3', '131583b5-785e-4127-81f0-e097163c5654', NULL, 'site/foto8.jpeg', 'gallery', 5),
  ('f3840536-e702-4e33-bee1-fadbe6813fc8', '131583b5-785e-4127-81f0-e097163c5654', '72e893c1-2512-4360-9244-361f1bd50c3f', 'rooms/pool/pool-01.jpeg', 'room', 0),
  ('9a0f5524-d681-482d-8a88-5e0a9f5735e7', '131583b5-785e-4127-81f0-e097163c5654', '72e893c1-2512-4360-9244-361f1bd50c3f', 'rooms/pool/pool-02.jpeg', 'room', 1),
  ('4566e19e-3d7a-4b13-a442-ca4f7f1cce6d', '131583b5-785e-4127-81f0-e097163c5654', '72e893c1-2512-4360-9244-361f1bd50c3f', 'rooms/pool/pool-03.jpeg', 'room', 2),
  ('a95bc068-1c17-4fb5-91c6-dfdfb63057a9', '131583b5-785e-4127-81f0-e097163c5654', 'cd8f632d-6c96-4315-b0ed-2650c3b33a83', 'rooms/suite/suite-01.jpeg', 'room', 0),
  ('50b0f8a3-76a7-4afc-8a0a-af222f60531b', '131583b5-785e-4127-81f0-e097163c5654', '31543e30-a762-4c86-8594-16fc4fcf5491', 'rooms/queen-a/queen-a-01.jpeg', 'room', 0),
  ('742c762f-ddf1-4e06-9b6a-a90b4aec7e8d', '131583b5-785e-4127-81f0-e097163c5654', '31543e30-a762-4c86-8594-16fc4fcf5491', 'rooms/queen-a/queen-a-02.jpeg', 'room', 1),
  ('dcf05676-d8df-42fa-8bbe-9d5bb389360a', '131583b5-785e-4127-81f0-e097163c5654', '78c0de2a-5ec7-472c-81ba-07e2711fcc91', 'rooms/queen-b/queen-b-01.jpeg', 'room', 0),
  ('cffcc44a-6240-4e56-b8f5-09a3d744e772', '131583b5-785e-4127-81f0-e097163c5654', '78c0de2a-5ec7-472c-81ba-07e2711fcc91', 'rooms/queen-b/queen-b-02.jpeg', 'room', 1),
  ('1d70e8ed-8192-481d-8298-d9724f9fdd9f', '131583b5-785e-4127-81f0-e097163c5654', 'cddc3758-65fb-4a7f-9a89-2505240f3aae', 'rooms/queen-c/queen-c-01.jpeg', 'room', 0),
  ('c185604a-3a27-444a-adce-d0614c878f05', '131583b5-785e-4127-81f0-e097163c5654', 'cddc3758-65fb-4a7f-9a89-2505240f3aae', 'rooms/queen-c/queen-c-02.jpeg', 'room', 1),
  ('5620f759-0fce-43e4-b42c-0f81fdd49db9', '131583b5-785e-4127-81f0-e097163c5654', 'aee44930-98b2-4709-8993-0a7b3085b9c3', 'rooms/bunks/bunks-01.jpeg', 'room', 0),
  ('e4b2b866-3eae-4b89-b87d-9c8e513f4c6d', '131583b5-785e-4127-81f0-e097163c5654', 'aee44930-98b2-4709-8993-0a7b3085b9c3', 'rooms/bunks/bunks-02.jpeg', 'room', 1),
  ('0bcf73ac-1c1d-4418-9982-2edde9a3e50c', '131583b5-785e-4127-81f0-e097163c5654', '7a0d6543-3cb4-4cd3-a602-8d586e104484', 'rooms/living/living-01.jpeg', 'room', 0),
  ('fbf9b207-dfea-440d-a2bd-76712c8997c6', '131583b5-785e-4127-81f0-e097163c5654', '7a0d6543-3cb4-4cd3-a602-8d586e104484', 'rooms/living/living-02.jpeg', 'room', 1),
  ('b8e9304c-cba9-4a7a-ac5e-209069c319b1', '131583b5-785e-4127-81f0-e097163c5654', '7a0d6543-3cb4-4cd3-a602-8d586e104484', 'rooms/living/living-03.jpeg', 'room', 2),
  ('a406ca1a-6ae1-4f17-8b53-dd0340e61bf3', '131583b5-785e-4127-81f0-e097163c5654', 'a4a71c65-7b77-48ae-8803-94f4f728342c', 'rooms/garden/garden-01.jpeg', 'room', 0),
  ('e93e93c3-a683-4626-8539-f9a270792eb6', '131583b5-785e-4127-81f0-e097163c5654', 'a4a71c65-7b77-48ae-8803-94f4f728342c', 'rooms/garden/garden-02.jpeg', 'room', 1),
  ('5d6e2721-da43-4b4e-9201-ca769efa0939', '131583b5-785e-4127-81f0-e097163c5654', 'a4a71c65-7b77-48ae-8803-94f4f728342c', 'rooms/garden/garden-03.jpeg', 'room', 2),
  ('1c503188-12bd-41e6-b642-2769fc6d1e68', '131583b5-785e-4127-81f0-e097163c5654', '37ec69d5-035e-4d80-b5ce-4018ca08b29d', 'rooms/bbq/bbq-01.jpeg', 'room', 0),
  ('eb2da880-0545-4ecb-9c7c-16e2f38ac06a', '131583b5-785e-4127-81f0-e097163c5654', '616122c6-9370-4065-9c8e-9a7b251a45de', 'rooms/exterior/exterior-01.jpeg', 'room', 0);

-- Storage bucket, so local Storage emulation matches production.
INSERT INTO "storage"."buckets" ("id", "name", "public")
VALUES ('property-photos', 'property-photos', true)
ON CONFLICT (id) DO NOTHING;
