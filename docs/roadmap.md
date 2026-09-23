# Saywa Direct — Roadmap técnico

SaaS multi-tenant para que alojamientos independientes en Perú conviertan consultas de WhatsApp/Instagram
en reservas directas pagadas. Fuera de alcance del MVP: PMS completo, channel manager por API,
marketplace, precios dinámicos.

Decisiones de arquitectura: [`docs/adr/`](adr/). Workflow por ticket: skill `ticket` (`.claude/skills/ticket`).

## Convenciones de tickets

- **Id**: `SD-<fase><nn>` (SD-101 = Fase 1, ticket 01). Rama: `<type>/SD-101-slug`.
- **Tamaño**: `S` ≤ 1 día · `M` 2–3 días · `L` 4–5 días. Un `L` que crece se divide.
- **Review**: `R` = `reviewer` · `R+S` = `reviewer` + `security-reviewer`.
- **Estado**: `[ ]` pendiente · `[~]` en curso · `[x]` hecho.

### Definition of Done (todos los tickets)

- Criterios de aceptación cumplidos y verificados.
- `lint`, `typecheck`, `test`, `build` (y `supabase test db` si hay migraciones) en verde en CI.
- Tests exigidos por la skill `testing`.
- Review aplicado según el ticket; hallazgos críticos resueltos.
- Sin secretos, sin `any`, sin errores de BD expuestos al cliente.
- PR con plantilla completa; squash merge con Conventional Commit.

## Hitos

| Hito | Tickets | Resultado visible |
|---|---|---|
| **M0 · Base sólida** | Fase 0 | Sitio actual reproducible, con CI y esquema versionado |
| **M1 · Multi-tenant** | Fase 1 | Saywa Lodges y un tenant demo servidos por host, con login real |
| **M2 · Contenido y tarifas** | Fase 2 | Dueño edita su sitio y sus tarifas desde el dashboard |
| **M3 · Calendario sin dobles reservas** | Fase 3 | Calendario único sincronizado con Airbnb/Booking |
| **M4 · Primera reserva directa** 🎯 | Fase 4 | Link de reserva + pago por voucher en producción para Saywa |
| **M5 · Pago en línea** | Fase 5 | Mercado Pago por tenant |
| **M6 · Listo para clientes** | Fase 6–7 | CRM, check-in, dominios propios, hardening, portafolio |

---

## Fase 0 — Estabilizar (M0)

### [x] SD-001 · chore: commit Supabase content migration and reactivate project
`S` (real: `M` — ver nota) · Depende: — · Review: `R+S`
- **Objetivo**: dejar en `main` el trabajo pendiente (contenido en Supabase, `/api/admin/*`) y la BD operativa.
- **Alcance**: revisar el diff pendiente, reactivar el proyecto Supabase, commit en rama propia.
- **Criterios**
  - [x] El proyecto Supabase está activo y el sitio carga en local con datos reales.
  - [x] El trabajo pendiente está mergeado en `main` en commits coherentes.
  - [x] Las imágenes borradas de `public/images` están efectivamente en Storage.
- **Nota de cierre**: el proyecto Supabase estaba activo pero con 0 filas en las 6 tablas — solo se
  había creado el esquema, nunca se cargó contenido. Se recuperó el contenido real y las 27 fotos
  desde el propio historial de git (`HEAD` previo) con `scripts/seed-content.mjs` (verificado:
  1 propiedad, 10 espacios, 27 fotos, 4 tarifas, 6 amenities, 6 distancias, mapeo foto↔habitación
  correcto). `security-reviewer` encontró un **XSS almacenado crítico** (JSON-LD sin escapar, ahora
  alimentado por contenido editable) más URLs sin validar (`javascript:` en `mapsUrl`/`airbnbUrl`),
  falta de zod en los 4 payloads de `/api/admin/*` y uploads sin validar MIME/tamaño; `reviewer`
  encontró que el panel admin no revisaba `res.ok` (mostraba "Saved ✓" aunque la BD rechazara el
  cambio). Todo esto se corrigió dentro de este ticket (no se difirió) por ser explotable de inmediato
  en producción: `lib/json-ld.ts` (escape), `lib/validation/admin.ts` (zod + validación de uploads),
  `lib/api-error.ts` (errores genéricos), fixes en `app/admin/page.tsx`. Esto adelanta la mayor parte
  del alcance de SD-005 — ver nota ahí.

### [ ] SD-002 · chore(db): version current schema with Supabase CLI
`M` · Depende: SD-001 · Review: `R+S`
- **Objetivo**: poder reconstruir la BD desde cero.
- **Alcance**: `supabase init`, `supabase db pull` → `supabase/migrations`, `seed.sql` con el contenido de Saywa,
  tipos generados en `lib/supabase/database.types.ts`, tipar el cliente actual con ellos.
- **Criterios**
  - [ ] `npx supabase start && npx supabase db reset` levanta el sitio en local sin el proyecto remoto.
  - [ ] Los tipos generados se usan en `lib/supabase.ts` (sin `select("*")` sin tipar).
  - [ ] README documenta el setup local.

### [ ] SD-003 · chore: tooling baseline
`S` · Depende: SD-001 · Review: `R`
- **Alcance**: scripts `typecheck` y `test`; Vitest configurado; `lib/env.ts` con zod (falla al arrancar si falta una
  variable); eliminar `ws` y subir `@types/node` a 24 (verificar runtime de Vercel); eliminar `vercel.json` y dejar headers
  solo en `next.config.ts` sin `X-XSS-Protection`; acotar `images.remotePatterns` al host del proyecto.
- **Criterios**
  - [ ] `npm run typecheck` y `npm run test` existen y pasan (con un test de humo).
  - [ ] Arrancar sin `SUPABASE_URL` produce un error claro.
  - [ ] Headers de seguridad presentes en una respuesta (verificado con `curl -I`).

### [ ] SD-004 · ci: GitHub Actions pipeline
`S` · Depende: SD-002, SD-003 · Review: `R`
- **Alcance**: workflow en PR y push a `main`: install con caché, lint, typecheck, test, Supabase local + `supabase test db`, build.
- **Criterios**
  - [ ] Un PR con error de tipos falla el CI.
  - [ ] Badge de CI en el README.
  - [ ] Protección de rama `main`: requiere CI verde.

### [ ] SD-005 · fix(security): harden current production surface
`S` · Depende: SD-001 · Review: `R+S`
- **Objetivo**: cerrar lo explotable mientras el sitio actual sigue en producción.
- **Ya resuelto en SD-001** (adelantado por hallazgos de review, no re-hacer): JSON-LD escapado
  (`lib/json-ld.ts`), errores genéricos en vez de `error.message` (`lib/api-error.ts`), MIME/tamaño
  validados en uploads (`lib/validation/admin.ts`), zod en los 4 payloads de `/api/admin/*`.
- **Alcance restante**: filtrar por `property_id` en `PUT/DELETE /api/admin/photos` (hoy son IDOR de
  bajo impacto real porque solo existe una propiedad — se vuelve relevante recién en Fase 1); test
  unitario formal de `toJsonLd()` una vez exista Vitest (SD-003) — hoy solo verificado manualmente.
- **Criterios**
  - [x] Un nombre de propiedad con `</script>` no rompe el HTML (verificado manualmente en SD-001;
        falta el test automatizado formal).
  - [x] Subir un SVG o un archivo de 10 MB devuelve 400.
  - [ ] Borrar una foto con un id de otra propiedad devuelve 404.

### [ ] SD-006 · docs: README, ADRs and roadmap
`S` · Depende: — · Review: `R`
- **Alcance**: README del proyecto (qué es, stack, arquitectura, setup, scripts), ADR 0001–0004, este roadmap.
- **Criterios**
  - [ ] Una persona nueva levanta el proyecto siguiendo solo el README.

---

## Fase 1 — Multi-tenant y autenticación (M1)

### [ ] SD-101 · feat(db): organizations, memberships and org scoping
`L` · Depende: SD-002 · Review: `R+S`
- **Alcance**: tablas `organizations`, `memberships (role owner|staff)`; función `is_member(org_id)`
  (`security definer`, `search_path = ''`); `org_id not null` + índice en todas las tablas existentes con backfill
  a la org `saywa-lodges`; columnas `subdomain`, `custom_domain`, `published` en `properties`.
- **Criterios**
  - [ ] Migración aplicada sobre datos existentes sin pérdida (verificado con seed).
  - [ ] Seed con dos orgs: `saywa-lodges` y `demo`, cada una con su propiedad y usuario owner.
  - [ ] pgTAP: `is_member` devuelve true/false correctamente.

### [ ] SD-102 · feat(db): row level security on all tables and storage
`L` · Depende: SD-101 · Review: `R+S`
- **Alcance**: RLS en todas las tablas; políticas por operación con `is_member`; lectura `anon` solo de propiedades
  `published` y su contenido; Storage con rutas `org_id/...` y políticas por prefijo; migrar rutas existentes.
- **Criterios**
  - [ ] pgTAP por tabla: owner de `demo` no lee ni escribe datos de `saywa-lodges`.
  - [ ] `anon` no ve propiedades `published = false`.
  - [ ] `get_advisors` (security) sin alertas de RLS.

### [ ] SD-103 · feat(auth): Supabase Auth and data access layer
`M` · Depende: SD-101 · Review: `R+S`
- **Alcance**: `@supabase/ssr`; `lib/supabase/{server,browser,admin}.ts`; `lib/dal/session.ts` con
  `verifySession()` y `requireMembership(orgId)` usando `cache()`; página `/login` (email + contraseña, recuperación
  de contraseña), logout. `admin.ts` marcado `server-only`.
- **Criterios**
  - [ ] Ruta del dashboard sin sesión redirige a `/login`.
  - [ ] Llamar una server action sin sesión devuelve error de autorización (test).
  - [ ] `lib/supabase/admin.ts` no se importa desde ningún componente ni página (regla ESLint `no-restricted-imports`).

### [ ] SD-104 · refactor: move data reads into the DAL
`M` · Depende: SD-102, SD-103 · Review: `R+S`
- **Alcance**: `lib/property.ts`, `lib/spaces.ts`, `lib/photos.ts` → `lib/dal/public/*` (cliente anon, propiedad
  explícita) con `cache()` para deduplicar por request. Eliminar la constante `PROPERTY_SLUG`.
- **Criterios**
  - [ ] El sitio de Saywa renderiza idéntico.
  - [ ] Cada request hace una sola consulta de propiedad (verificado con logs).
  - [ ] Ningún archivo fuera de `lib/dal` importa clientes Supabase.

### [ ] SD-105 · feat(routing): host-based tenant resolution
`L` · Depende: SD-104 · Review: `R+S`
- **Alcance**: `proxy.ts` reescribe `{sub}.<root>` y dominios propios a `/sites/[host]/[lang]/...`,
  `app.<root>` a `/app/...`; mover `app/[lang]` a `app/sites/[host]/[lang]`; `<html lang>` en el layout del sitio
  (sin `headers()` en el root); `getSiteByHost()` cacheado; metadata, `sitemap.ts`, `robots.ts` y JSON-LD por host;
  `ROOT_DOMAIN` en `lib/env.ts`.
- **Criterios**
  - [ ] `saywa-lodges.localhost:3000/es` y `demo.localhost:3000/es` muestran contenido distinto.
  - [ ] Host desconocido → 404; propiedad no publicada → 404.
  - [ ] `sitemap.xml` y canonical usan el host del tenant.
  - [ ] ADR 0001 actualizado si cambia algo del diseño.

### [ ] SD-106 · feat(dashboard): authenticated dashboard shell
`M` · Depende: SD-103, SD-105 · Review: `R`
- **Alcance**: shadcn/ui inicializado; layout del dashboard mobile-first (navegación: Reservas, Calendario, Cotizar,
  Huéspedes, Sitio, Tarifas, Ajustes, con secciones vacías); selector de org si el usuario tiene más de una; enlace
  "Ver mi sitio".
- **Criterios**
  - [ ] Usable a 375 px de ancho.
  - [ ] Usuario sin membresías ve un estado vacío claro, no un error.

---

## Fase 2 — Contenido, unidades y tarifas (M2)

### [ ] SD-201 · feat(dashboard): property settings
`M` · Depende: SD-106 · Review: `R+S`
- **Alcance**: formulario de información, contacto/WhatsApp, dirección y coordenadas, SEO es/en, logo, tema
  (color primario/acento); server actions + zod; `revalidateTag('property:<id>')` al guardar.
- **Criterios**
  - [ ] Cambios visibles en el sitio público tras guardar, sin redeploy.
  - [ ] Validación de errores por campo en la UI.
  - [ ] Staff puede editar; un usuario de otra org no (test).

### [ ] SD-202 · feat(dashboard): site content and photo manager
`L` · Depende: SD-201 · Review: `R+S`
- **Alcance**: migración `rooms` → `spaces`; CRUD de spaces, amenities y distances con reordenamiento; gestor de fotos
  (hero, galería, por espacio) con validación de tipo/tamaño, rutas `org_id/`, borrado de Storage consistente
  (RPC o compensación).
- **Criterios**
  - [ ] Reordenar y guardar persiste el orden en el sitio.
  - [ ] Borrar un espacio borra sus fotos de BD y Storage.
  - [ ] Las fotos de espacios ya son editables (antes no lo eran).

### [ ] SD-203 · chore: remove legacy admin
`S` · Depende: SD-202 · Review: `R+S`
- **Alcance**: eliminar `app/admin`, `app/api/admin/*`, Basic Auth de `proxy.ts`, variables `ADMIN_*`.
- **Criterios**
  - [ ] `/admin` → 404; no quedan referencias a `ADMIN_USER`/`ADMIN_PASSWORD`.

### [ ] SD-204 · feat: bookable units
`M` · Depende: SD-106 · Review: `R+S`
- **Alcance**: tabla `units` (kind `entire_place|room`, `max_guests`, `included_guests`, `active`); CRUD en dashboard;
  seed de Saywa (casa entera y/o habitaciones).
- **Criterios**
  - [ ] Una propiedad puede tener 1..n unidades; desactivar una la oculta del cotizador.
  - [ ] pgTAP de aislamiento.

### [ ] SD-205 · feat(db): seasons, unit rates and fees
`M` · Depende: SD-204 · Review: `R+S`
- **Alcance**: `seasons` (rango de fechas, prioridad), `unit_rates` (base o por temporada: `nightly_cents`,
  `weekend_nightly_cents`, `extra_guest_cents`, `min_nights`), `fees` (`per_stay|per_night|per_guest`),
  `currency` en `properties`; `check` constraints (montos ≥ 0, `end_date > start_date`).
- **Criterios**
  - [ ] Constraints rechazan datos inválidos (pgTAP).
  - [ ] Seed con tarifas reales de Saywa (temporada baja/alta/feriados).

### [ ] SD-206 · feat(domain): pricing engine
`M` · Depende: — (tipos de SD-205) · Review: `R`
- **Alcance**: `lib/domain/pricing.ts` puro: `quoteStay({ rates, seasons, fees, checkIn, checkOut, guests })` →
  desglose por noche, fees, total, adelanto (`deposit_percent`), errores tipados (mínimo de noches, capacidad).
  Temporada de mayor prioridad gana; fin de semana = noches de viernes y sábado.
- **Criterios**
  - [ ] Cobertura ≥ 90 %.
  - [ ] Casos: cruce de temporadas, feriado dentro de temporada, huéspedes extra, mínimo de noches por temporada
        de la noche de llegada, redondeo del adelanto en céntimos.

### [ ] SD-207 · feat(dashboard): rates and seasons management
`M` · Depende: SD-205, SD-206 · Review: `R`
- **Alcance**: UI de temporadas y tarifas por unidad; simulador de cotización en vivo usando `quoteStay`.
- **Criterios**
  - [ ] El simulador coincide con el cálculo del servidor para las mismas entradas.

### [ ] SD-208 · feat(site): data-driven rates section and theming
`M` · Depende: SD-207 · Review: `R`
- **Alcance**: sección Tarifas con "desde S/ X" derivado de datos numéricos; eliminar `rate_tiers`; tema del tenant
  vía CSS variables; componentes públicos movidos a `components/site`; textos de UI genéricos (sin copy de Saywa
  en `dictionaries/`).
- **Criterios**
  - [ ] El tenant `demo` luce con sus propios colores y textos.
  - [ ] Ningún texto específico de Saywa queda en código.

---

## Fase 3 — Calendario e iCal (M3)

### [ ] SD-301 · feat(db): calendar blocks with overlap exclusion
`M` · Depende: SD-204 · Review: `R+S`
- **Alcance**: `btree_gist`; `calendar_blocks (unit_id, period daterange, source booking|ical|manual, booking_id,
  feed_id, external_uid, expires_at)` con `EXCLUDE USING gist (unit_id WITH =, period WITH &&)`; RPCs para bloqueos
  manuales. ADR 0003.
- **Criterios**
  - [ ] pgTAP: dos bloques solapados en la misma unidad fallan; check-out = check-in de otro no es solape.
  - [ ] pgTAP: dos transacciones concurrentes por las mismas fechas → solo una gana.

### [ ] SD-302 · feat(domain): availability helpers
`S` · Depende: — · Review: `R`
- **Alcance**: `lib/domain/availability.ts` y `dates.ts`: noches entre fechas, rangos `[)`, días bloqueados de un mes,
  "hoy" en `America/Lima`.
- **Criterios**
  - [ ] Tests con cambio de mes/año y reloj fijado.

### [ ] SD-303 · feat(dashboard): unit calendar
`L` · Depende: SD-301, SD-302 · Review: `R`
- **Alcance**: vista mensual por unidad (y vista compacta de todas), color por origen (directa, Airbnb, Booking,
  manual); crear/eliminar bloqueos manuales con nota.
- **Criterios**
  - [ ] Intentar bloquear fechas ocupadas muestra un error claro (del constraint, no de validación previa).
  - [ ] Usable en móvil.

### [ ] SD-304 · feat(ical): per-channel calendar export
`M` · Depende: SD-301 · Review: `R+S`
- **Alcance**: `ical_feeds` (unit, channel, `import_url`, `export_token`); route `/api/ical/[token]` que genera `.ics`
  con todos los bloques excepto los importados del mismo canal; tokens aleatorios, regenerables.
- **Criterios**
  - [ ] El `.ics` pasa un validador iCal y se importa en Google Calendar.
  - [ ] Token inválido → 404; el `.ics` no contiene datos personales del huésped.

### [ ] SD-305 · feat(ical): feed import and sync engine
`L` · Depende: SD-304 · Review: `R+S`
- **Alcance**: `lib/ical/import.ts`: fetch solo https, allowlist de hosts (airbnb, booking, vrbo), timeout y límite de
  tamaño; parseo (`node-ical`); upsert por `(feed_id, external_uid)`; borrar eventos desaparecidos; conflictos →
  `sync_conflicts`; UI para añadir feeds y ver último sync/error; botón "Sincronizar ahora".
- **Criterios**
  - [ ] Tests con fixtures reales anonimizados de Airbnb y Booking.
  - [ ] URL a IP privada o host fuera de la allowlist → rechazada (test).
  - [ ] Conflicto con una reserva directa queda registrado y visible en el dashboard.

### [ ] SD-306 · chore(email): transactional email infrastructure
`S` · Depende: SD-103 · Review: `R+S`
- **Alcance**: Resend (dominio verificado), `lib/email/` con plantillas React Email es/en, envío desde servidor,
  sin PII en logs.
- **Criterios**
  - [ ] Email de prueba enviado en entorno de preview.

### [ ] SD-307 · feat(ical): scheduled sync and conflict alerts
`M` · Depende: SD-305, SD-306 · Review: `R+S`
- **Alcance**: endpoint `/api/cron/ical-sync` protegido con `CRON_SECRET`; cada 15 min (Vercel Cron Pro o `pg_cron`);
  procesa feeds en lotes; email al owner ante conflicto nuevo o feed caído > 24 h.
- **Criterios**
  - [ ] Sin el secreto → 401.
  - [ ] Un feed que falla no detiene los demás.

### [ ] SD-308 · feat(site): public availability calendar
`M` · Depende: SD-303 · Review: `R`
- **Alcance**: reemplazar el iframe de Airbnb por calendario propio de disponibilidad (solo ocupado/libre).
- **Criterios**
  - [ ] No expone origen ni datos de las reservas.

---

## Fase 4 — Cotizador, reservas y pago manual (M4 🎯)

### [ ] SD-401 · feat(db): guests, quotes, bookings and payments
`L` · Depende: SD-205, SD-301 · Review: `R+S`
- **Alcance**: tablas `guests`, `quotes`, `bookings`, `payments`; RPC `create_booking_from_quote` (transacción:
  valida quote vigente, libera holds vencidos, upsert guest, crea booking `pending_payment` + bloque con
  `expires_at`); RPCs `confirm_payment`, `reject_payment`, `cancel_booking`, `expire_holds`; datos de pago por
  propiedad (Yape/Plin, cuentas bancarias).
- **Criterios**
  - [ ] pgTAP: reservar fechas ocupadas falla; quote vencida falla; hold vencido libera fechas.
  - [ ] Transiciones de estado inválidas rechazadas (p. ej. confirmar una cancelada).

### [ ] SD-402 · feat(dashboard): quote builder with WhatsApp share
`M` · Depende: SD-401 · Review: `R+S`
- **Alcance**: cotizar (unidad, fechas, huéspedes) → `quoteStay` en servidor → guardar quote con token y vencimiento;
  botón "Copiar para WhatsApp" con mensaje es/en y link; lista de cotizaciones abiertas.
- **Criterios**
  - [ ] El total guardado lo calcula el servidor aunque el cliente envíe otro.
  - [ ] Cotizar fechas no disponibles muestra aviso antes de generar el link.

### [ ] SD-403 · feat(site): booking link checkout
`L` · Depende: SD-402 · Review: `R+S`
- **Alcance**: `/[lang]/reservar/q/[token]`: resumen, desglose, políticas, formulario del huésped (zod), aceptación de
  términos → RPC → redirección a `/[lang]/reserva/[public_token]`.
- **Criterios**
  - [ ] Token inválido o vencido → página clara con botón de WhatsApp.
  - [ ] Doble envío del formulario no crea dos reservas.

### [ ] SD-404 · feat(site): self-service quote
`M` · Depende: SD-403 · Review: `R+S`
- **Alcance**: en el sitio, selector de fechas y huéspedes → quote pública → mismo checkout.
- **Criterios**
  - [ ] Respeta mínimo de noches y capacidad con mensajes claros.

### [ ] SD-405 · feat(payments): manual payment with voucher upload
`M` · Depende: SD-403 · Review: `R+S`
- **Alcance**: página de reserva muestra instrucciones (Yape/Plin/transferencia) y monto del adelanto; subida de
  voucher con signed upload URL a bucket privado (jpeg/png/webp/pdf ≤ 5 MB); payment `pending_review`.
- **Criterios**
  - [ ] Voucher accesible solo para miembros de la org (URL firmada de corta duración).
  - [ ] Subir voucher a una reserva ajena o expirada falla.

### [ ] SD-406 · feat(dashboard): bookings management
`L` · Depende: SD-405 · Review: `R+S`
- **Alcance**: lista con filtros (estado, fechas, origen) y detalle; ver voucher; aprobar/rechazar pago; cancelar;
  registrar reserva manual (cerrada por WhatsApp/efectivo); registrar pago de saldo.
- **Criterios**
  - [ ] Aprobar el pago confirma la reserva y fija el bloque (sin `expires_at`).
  - [ ] Reserva manual respeta disponibilidad.

### [ ] SD-407 · feat(email): booking lifecycle emails
`M` · Depende: SD-306, SD-406 · Review: `R`
- **Alcance**: al huésped: reserva recibida, confirmada, pago rechazado, instrucciones de llegada (X días antes);
  al owner: nueva reserva, voucher recibido.
- **Criterios**
  - [ ] Idioma según la reserva; sin enviar dos veces el mismo email (idempotencia por evento).

### [ ] SD-408 · feat: hold expiration job and booking status page
`S` · Depende: SD-401 · Review: `R+S`
- **Alcance**: cron que ejecuta `expire_holds`; página `/[lang]/reserva/[public_token]` con estado y siguiente paso.
- **Criterios**
  - [ ] Hold vencido pasa la reserva a `expired` y libera fechas.

### [ ] SD-409 · security: abuse protection on public actions
`S` · Depende: SD-403 · Review: `R+S`
- **Alcance**: rate limiting / BotID en crear reserva, cotizar y subir voucher; límites de holds activos por IP/teléfono.
- **Criterios**
  - [ ] Ráfaga de 20 reservas desde el mismo origen es bloqueada.

### [ ] SD-410 · test(e2e): booking flow
`M` · Depende: SD-406 · Review: `R`
- **Alcance**: Playwright en CI contra Supabase local: owner cotiza → huésped reserva → sube voucher → owner aprueba
  → reserva confirmada y fechas bloqueadas.
- **Criterios**
  - [ ] Corre en CI en < 5 min y es estable (3 ejecuciones seguidas en verde).

---

## Fase 5 — Mercado Pago (M5)

### [ ] SD-501 · refactor(payments): payment provider abstraction
`S` · Depende: SD-405 · Review: `R`
- **Alcance**: `lib/payments/provider.ts` (`createCheckout`, `handleWebhook`); adaptar pago manual. ADR 0004.

### [ ] SD-502 · feat(settings): per-tenant Mercado Pago credentials
`M` · Depende: SD-501 · Review: `R+S`
- **Alcance**: credenciales por org cifradas (Supabase Vault), nunca devueltas al cliente; prueba de conexión.
- **Criterios**
  - [ ] Las credenciales no aparecen en respuestas, logs ni en el bundle del cliente.

### [ ] SD-503 · feat(payments): Mercado Pago Checkout Pro
`M` · Depende: SD-502 · Review: `R+S`
- **Alcance**: preferencia con `external_reference = booking_id`, monto del servidor, URLs de retorno; hold de 30 min.

### [ ] SD-504 · feat(payments): Mercado Pago webhook
`M` · Depende: SD-503 · Review: `R+S`
- **Alcance**: `/api/webhooks/mercadopago`: verificar `x-signature`, `webhook_events` (idempotencia), reconsultar pago a
  la API con las credenciales del tenant, confirmar vía RPC; pago aprobado sobre reserva expirada → alerta al owner.
- **Criterios**
  - [ ] Firma inválida → 401; evento duplicado → sin efectos (tests).

### [ ] SD-505 · test(e2e): Mercado Pago sandbox
`S` · Depende: SD-504 · Review: `R`

---

## Fase 6 — CRM, check-in y plataforma (M6)

### [ ] SD-601 · feat(crm): guests
`M` · Depende: SD-406 · Review: `R+S`
- **Alcance**: lista, búsqueda, ficha con historial de estancias y gasto, notas, export CSV (solo owner).

### [ ] SD-602 · feat(crm): digital check-in
`M` · Depende: SD-601 · Review: `R+S`
- **Alcance**: formulario por reserva (incluye reservas de Airbnb/manuales): datos, documento, hora de llegada,
  consentimiento de marketing separado y registrado (Ley 29733).
- **Criterios**
  - [ ] Sin consentimiento, el huésped no aparece en exportaciones de marketing.

### [ ] SD-603 · feat(platform): tenant provisioning (superadmin)
`M` · Depende: SD-105 · Review: `R+S`
- **Alcance**: rol superadmin (tabla aparte, no en `memberships`); crear org, propiedad, subdominio e invitar owner por email.

### [ ] SD-604 · feat(platform): custom domains
`L` · Depende: SD-603 · Review: `R+S`
- **Alcance**: alta de dominio vía Vercel Domains API, estado de verificación DNS e instrucciones en el dashboard,
  redirección www ↔ apex.
- **Criterios**
  - [ ] `saywalodges.com` servido como tenant en producción.

### [ ] SD-605 · feat: audit log
`S` · Depende: SD-406 · Review: `R+S`
- **Alcance**: registrar acciones sensibles (aprobar/rechazar pago, cancelar, cambiar tarifas, credenciales).

### [ ] SD-606 · chore(obs): error monitoring and structured logs
`S` · Depende: — · Review: `R`
- **Alcance**: monitoreo de errores y logs estructurados sin PII; alertas de fallo de cron/webhook.

---

## Fase 7 — Hardening y portafolio

### [ ] SD-701 · security: CSP and headers
`M` · Depende: SD-105 · Review: `R+S`
- **Alcance**: CSP con nonce (ver `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`),
  compatible con Mercado Pago.

### [ ] SD-702 · chore: production readiness
`S` · Depende: M4 · Review: `R`
- **Alcance**: Supabase Pro (sin pausa, backups), migraciones aplicadas por CI, runbook (restaurar backup,
  rotar secretos, incidente de doble reserva).

### [ ] SD-703 · docs: portfolio polish
`S` · Depende: M6 · Review: `R`
- **Alcance**: diagrama de arquitectura, capturas, tenant demo público, sección "decisiones técnicas" en el README
  enlazando ADRs.

### [ ] SD-704 · feat(marketing): saywa.pe landing
`M` · Depende: SD-105 · Review: `R`
- **Alcance**: landing comercial en el dominio raíz con formulario de contacto a WhatsApp.
