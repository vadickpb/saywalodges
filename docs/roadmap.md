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
| **M8 · Finanzas** | Fase 8 (SD-801–805) | Ingresos, egresos, reportes estilo Airbnb y Excel para el contador |

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

### [x] SD-002 · chore(db): version current schema with Supabase CLI
`M` · Depende: SD-001 · Review: `R+S`
- **Objetivo**: poder reconstruir la BD desde cero.
- **Alcance**: `supabase init`, `supabase db pull` → `supabase/migrations`, `seed.sql` con el contenido de Saywa,
  tipos generados, tipar el cliente actual con ellos.
- **Criterios**
  - [x] `npx supabase start && npx supabase db reset` levanta el sitio en local sin el proyecto remoto.
  - [x] Los tipos generados se usan en `lib/supabase.ts` (sin `select("*")` sin tipar).
  - [x] README documenta el setup local.
- **Nota de cierre**: tipos en `lib/database.types.ts` (no `lib/supabase/database.types.ts` — ese
  directorio no existe hasta el refactor de SD-103; mover entonces). El remoto tenía 2 migraciones
  registradas de cuando se creó el esquema fuera de este repo, sin archivos locales; se repararon
  con `supabase migration repair --status reverted` (solo metadata, sin tocar esquema/datos) antes
  de poder pullear. `syncTable()` en `app/api/admin/content/route.ts` necesitó un `as never` acotado
  para las operaciones genéricas sobre las 4 tablas (documentado in situ); no es un bypass de
  validación — zod ya corre antes, en el `PUT`.
  **Hallazgo para Fase 1**: el esquema real tiene `GRANT` amplio (INSERT/UPDATE/DELETE/SELECT) a
  `anon` y `authenticated` en las 6 tablas (default del table editor de Supabase). Hoy no es
  explotable porque RLS está activo sin políticas (deniega todo), pero SD-102 debe estrechar estos
  GRANTs al definir las políticas reales, no asumir que el grant por defecto es seguro.

### [x] SD-003 · chore: tooling baseline
`S` · Depende: SD-001 · Review: `R+S`
- **Alcance**: scripts `typecheck` y `test`; Vitest configurado; `lib/env.ts` con zod (falla al arrancar si falta una
  variable); eliminar `ws` y subir `@types/node` a 24 (verificar runtime de Vercel); eliminar `vercel.json` y dejar headers
  solo en `next.config.ts` sin `X-XSS-Protection`; acotar `images.remotePatterns` al host del proyecto.
- **Criterios**
  - [x] `npm run typecheck` y `npm run test` existen y pasan (19 tests reales, no solo de humo).
  - [x] Arrancar sin `SUPABASE_URL` produce un error claro.
  - [x] Headers de seguridad presentes en una respuesta (verificado con `curl -I`).
- **Nota de cierre**: `R+S` porque el diff toca variables de entorno (regla de delegación de `CLAUDE.md`), aunque
  el plan original decía solo `R`. Los tests de `lib/json-ld.ts` y `lib/validation/admin.ts` formalizan la
  verificación manual de SD-001 (cerraba un pendiente explícito de la nota de SD-005). `images.remotePatterns`
  ahora deriva el host de `env.SUPABASE_URL` en vez de un ref hardcodeado, para no romper si cambia el proyecto.
  Confirmado que Node ≥22 tiene `WebSocket` global nativo (se usaba `ws` solo como polyfill), pero
  `package.json` declara `engines.node >= 24` para que coincida con `@types/node` y con el runtime real
  de Vercel (si no, el typecheck aceptaría APIs de Node 24 inexistentes en un runtime de Node 22 —
  hallazgo de `reviewer`, corregido).

### [x] SD-004 · ci: GitHub Actions pipeline
`S` · Depende: SD-002, SD-003 · Review: `R`
- **Alcance**: workflow en PR y push a `main`: install con caché, lint, typecheck, test, Supabase local + `supabase test db`, build.
- **Criterios**
  - [x] Un PR con error de tipos falla el CI.
  - [x] Badge de CI en el README.
  - [ ] Protección de rama `main`: requiere CI verde. **Acción manual pendiente del usuario** — no
        automatizable sin `gh`/API de GitHub: Settings → Branches → Add rule → `main` → "Require status
        checks to pass" → marcar `lint, typecheck, test, build` y `supabase db reset, pgTAP`.
- **Nota de cierre**: dos jobs en paralelo (`app`: lint/typecheck/test/build; `db`: `supabase start` +
  `db reset` + `test db`), no uno secuencial — más rápido y sin que `build` dependa de que el stack de
  Supabase esté arriba. `build` nunca llega a conectarse a Supabase de verdad (todas las rutas que leen
  contenido son dinámicas, no prerenderizadas — confirmado en el output de `next build`), así que usa
  credenciales *placeholder* solo para pasar la validación de `lib/env.ts`; verificado localmente con
  esos mismos valores antes de confiar en que funcionaría en CI. `supabase test db` fallaba con
  "NOTESTS" porque no había ningún test pgTAP todavía — se agregó `supabase/tests/0001_rls_enabled.test.sql`
  (verifica que RLS sigue habilitado en las 6 tablas; sin políticas aún, así que no prueba aislamiento,
  solo que nadie lo desactivó por error) para que el paso tenga algo real que ejecutar en vez de fallar
  siempre por definición.

### [x] SD-005 · fix(security): harden current production surface
`S` · Depende: SD-001 · Review: `R+S`
- **Objetivo**: cerrar lo explotable mientras el sitio actual sigue en producción.
- **Ya resuelto en SD-001** (adelantado por hallazgos de review, no re-hacer): JSON-LD escapado
  (`lib/json-ld.ts`), errores genéricos en vez de `error.message` (`lib/api-error.ts`), MIME/tamaño
  validados en uploads (`lib/validation/admin.ts`), zod en los 4 payloads de `/api/admin/*`.
- **Alcance restante**: filtrar por `property_id` en `PUT/DELETE /api/admin/photos` (hoy son IDOR de
  bajo impacto real porque solo existe una propiedad — se vuelve relevante recién en Fase 1).
- **Nota de cierre**: el test unitario de `toJsonLd()` ya cubría el escape de `</script>` desde SD-003;
  el cambio de este ticket limita todas las mutaciones de fotos al `property_id` resuelto por el handler.
  Verificado de punta a punta contra Supabase local (no solo lectura de código): se sembró una segunda
  propiedad con una foto propia y se invocó el handler `DELETE` real con ese id — con el código viejo
  **sí la borraba** (IDOR real, no solo teórico); con el fix, devuelve 404 y la fila sobrevive. Lo mismo
  para `PUT` (fijar hero / reordenar): responde 200 pero no toca la fila de la otra propiedad.
- **Criterios**
  - [x] Un nombre de propiedad con `</script>` no rompe el HTML (test unitario en `lib/json-ld.test.ts`).
  - [x] Subir un SVG o un archivo de 10 MB devuelve 400.
  - [x] Borrar una foto con un id de otra propiedad devuelve 404.

### [x] SD-006 · docs: README, ADRs and roadmap
`S` · Depende: — · Review: `R`
- **Alcance**: README del proyecto (qué es, stack, arquitectura, setup, scripts), ADR 0001–0004, este roadmap.
- **Criterios**
  - [x] Una persona nueva levanta el proyecto siguiendo solo el README.
- **Nota de cierre**: hecho junto con SD-002 (el setup local de Supabase era la pieza que faltaba
  para que el README fuera completo). ADRs y roadmap ya existían desde el setup de Claude Code.

---

## Fase 1 — Multi-tenant y autenticación (M1)

### [x] SD-101 · feat(db): organizations, memberships and org scoping
`L` · Depende: SD-002 · Review: `R+S`
- **Alcance**: tablas `organizations`, `memberships (role owner|staff)`; función `is_member(org_id)`
  (`security definer`, `search_path = ''`); `org_id not null` + índice en todas las tablas existentes con backfill
  a la org `saywa-lodges`; columnas `subdomain`, `custom_domain`, `published` en `properties`.
- **Criterios**
  - [x] Migración aplicada sobre datos existentes sin pérdida (verificado con seed).
  - [x] Seed con dos orgs: `saywa-lodges` y `demo`, cada una con su propiedad y usuario owner.
  - [x] pgTAP: `is_member` devuelve true/false correctamente.
- **Nota de cierre**: la app **no se tocó para leer/autorizar por org** — eso es SD-104/SD-105. Sí fue
  necesario actualizar los 2 `insert` existentes que ya escribían en tablas ahora con `org_id not null`
  (`app/api/admin/{content,photos}/route.ts`), o `main` no compilaría; `lib/property.ts` ahora expone
  `orgId`. Seed: dos orgs reales (`Saywa Lodges` y `Demo Org`), cada una con su propiedad y un usuario
  en `auth.users` con `memberships.role = 'owner'` (contraseña de desarrollo fija — solo corre contra
  Supabase local, nunca contra el remoto). Las filas existentes de Saywa Lodges en `seed.sql` no se
  reescribieron fila por fila: un `DEFAULT` temporal en `org_id`/`subdomain` las completa, luego se
  elimina — las mutaciones reales de la app siempre pasan `org_id` explícito. pgTAP simula sesión de
  cada owner vía `request.jwt.claims` + `set local role authenticated` (ver `supabase/tests/0002_is_member.test.sql`).

### [~] SD-102 · feat(db): row level security on all tables
`L` · Depende: SD-101 · Review: `R+S`
- **Alcance**: RLS en las 8 tablas (las 6 de negocio + `organizations`/`memberships`); políticas por operación
  con `is_member(org_id)`; lectura `anon`/`authenticated` solo de propiedades `published` y su contenido.
  **Incluye** estrechar los `GRANT` heredados (hoy INSERT/UPDATE/DELETE/SELECT abierto a `anon`/`authenticated`
  en las 6 tablas — ver nota de cierre de SD-002) a lo mínimo que cada política realmente necesita; la FK
  compuesta `(property_id, org_id)` que cierra el hallazgo de consistencia de SD-101 (necesaria ahora: sin
  ella, una policy de insert con `is_member(org_id)` permitiría colar `org_id` propio con `property_id` ajeno);
  y un `check` de formato (minúsculas, DNS-válido) + lista de reservados (`app`, `www`, `api`, …) en
  `properties.subdomain`/`custom_domain`, antes de que SD-105 enrute por host.
- **Fuera de alcance (movido a SD-202)**: políticas de RLS en `storage.objects` y migrar las rutas reales de
  Storage a un prefijo por org. Hoy el admin usa siempre la `service_role` key (ignora RLS), así que esas
  políticas no tendrían efecto práctico hasta SD-103/104; mover archivos reales de producción merece su propio
  ticket, revisado con el mismo cuidado que SD-001, junto con la reescritura del gestor de fotos.
- **Criterios**
  - [x] pgTAP por tabla: owner de `demo` no lee ni escribe datos de `saywa-lodges`.
  - [x] `anon` no ve propiedades `published = false`.
  - [ ] `get_advisors` (security) sin alertas de RLS — **no verificable desde aquí**: el remoto todavía
        no tiene esta migración (Claude no tiene `db push`). Pendiente de que el usuario la aplique
        (`npx supabase db push` o pegarla en el SQL Editor) y luego corra `get_advisors` para confirmar.
- **Nota de cierre**: "owner de demo no lee datos de saywa-lodges" se verificó con precisión — un
  supuesto inicial equivocado trataba "puede leer contenido publicado de otra org" como fallo; no lo
  es, es el diseño correcto (contenido publicado es público por definición). Lo que sí se verificó de
  punta a punta contra Supabase local, con sesiones reales (login real vía GoTrue con las contraseñas
  sembradas en SD-101, no solo políticas leídas): un no-miembro nunca puede escribir una fila ajena
  (`UPDATE`/`DELETE` afectan 0 filas), nunca puede leer una fila **no publicada** de otra org, y un
  miembro sigue viendo y pudiendo escribir su propia org incluso sin publicar. Se añadió
  `is_property_published()` (mismo patrón que `is_member()`) para que la policy de `select` de las
  tablas hijas no dependa de una interacción implícita con la RLS de `properties`.

  **Dos rondas de `reviewer`/`security-reviewer` encontraron 4 huecos reales en la primera versión de
  este ticket, los 4 corregidos antes de cerrar** (no quedaron para después):
  1. El hallazgo de SD-101 sobre consistencia `org_id` padre↔hijo solo se cerró a medias: la FK
     compuesta `(property_id, org_id)` no cubría `photos.room_id`, que seguía con FK simple a
     `rooms(id)` — un miembro podía insertar/mover una foto propia apuntando `room_id` a un room de
     otra org. Arreglado con `unique(id, property_id)` en `rooms` + FK compuesta
     `(room_id, property_id) references rooms(id, property_id)` en `photos`.
  2. `is_member()`/`is_property_published()` quedaban invocables vía `/rest/v1/rpc/...` (`EXECUTE`
     a `PUBLIC` por defecto) — exactamente el patrón que el advisor de seguridad de Supabase marca.
     Movidas a un schema `private` (no listado en `api.schemas` de `supabase/config.toml`), con
     `usage`/`execute` otorgado explícitamente; las policies (SQL dentro de Postgres, no HTTP) siguen
     funcionando igual. Verificado: `/rpc/is_member` ahora da 404.
  3. Cualquier `authenticated` podía `INSERT` una propiedad nueva reclamando cualquier `subdomain`
     libre, o `UPDATE` el propio `subdomain`/`custom_domain` — choca con que SD-603 asigna la creación
     de tenants a un superadmin y SD-604 exige verificación de dominio. Arreglado quitando el `GRANT
     INSERT` de `properties` para `authenticated` (la creación queda solo para `service_role`) y
     pasando el `UPDATE` a privilegios por columna, excluyendo `id`/`org_id`/`slug`/`subdomain`/`custom_domain`.
  4. `organizations`/`memberships` no habían recibido el mismo `revoke all` que las 6 tablas de
     negocio, así que conservaban el `GRANT` amplio heredado del default del schema — el commit
     original afirmaba incorrectamente que ya estaban angostas. Corregido.

  `supabase/tests/0003_org_isolation.test.sql` quedó con 19 asserts: el patrón real de SD-101 (org
  propia + `property_id` ajeno, que ejercita la FK compuesta — la primera versión del test probaba
  la dirección equivocada, que RLS bloqueaba antes de llegar a la FK), el caso de `photos.room_id`,
  los 2 `check` de `subdomain`/`custom_domain` (3 asserts), el `GRANT` narrowing de `properties`
  (creación/`subdomain` denegados) y de una tabla de negocio para `anon`, y que un miembro sigue
  pudiendo leer/escribir lo suyo. Verificado también que el admin actual (usa `service_role`, ignora
  RLS) sigue funcionando exactamente igual tras todos estos cambios.

  **Segunda ronda de revisión** (sobre los 4 arreglos de arriba, ya commiteados): ambos revisores
  confirmaron en vivo contra Supabase local que los 4 quedaron cerrados — no solo que se agregó
  código, sino reconstruyendo el bypass original y viendo que ahora falla. Encontraron un quinto
  hallazgo (medio, no explotable hoy): sin login real todavía (SD-103), nadie externo puede obtener
  sesión, pero una vez que la haya, `authenticated` puede escribir `properties` directo por
  PostgREST sin pasar por el zod de `app/api/admin` — concretamente, `maps_url`/`airbnb_url` se
  pintan como `href`/`src` de iframe en el sitio público (`components/Location.tsx`, `Footer.tsx`,
  `Availability.tsx`), así que un valor `javascript:` ahí es XSS almacenado contra los huéspedes de
  ese tenant. Arreglado con `check` a nivel de BD (`https://` o vacío) en `maps_url`, `airbnb_url` y
  `site_url` — la capa que vale sin importar qué código escriba ahí en el futuro (server action,
  RPC, o REST directo). Verificado con una sesión real, no solo pgTAP: un `PATCH` directo con
  `maps_url: "javascript:alert(1)"` devuelve 400 con el nombre del constraint. `supabase/tests/0003_org_isolation.test.sql`
  quedó con 22 asserts (se agregó también `hasnt_function` confirmando que `public.is_member` ya no
  existe, y el caso de `photos.room_id` vía `UPDATE`, no solo `INSERT`). Pendiente, anotado para
  cuando exista la DAL (SD-104): replicar a nivel de BD los límites de longitud de zod, y algunos
  tests de introspección de privilegios (`table_privs_are`/`column_privs_are`) que quedaron fuera
  por ser más pulido que hallazgo real.

### [x] SD-103 · feat(auth): Supabase Auth and data access layer
`M` · Depende: SD-101 · Review: `R+S`
- **Alcance**: `@supabase/ssr`; `lib/supabase/{server,browser,admin}.ts`; `lib/dal/session.ts` con
  `verifySession()` y `requireMembership(orgId)` usando `cache()`; página `/login` (email + contraseña, recuperación
  de contraseña), logout. `admin.ts` marcado `server-only`.
- **Criterios**
  - [x] Ruta del dashboard sin sesión redirige a `/login`. Verificado contra Supabase local con una sesión
        real (login vía GoTrue con `owner@saywalodges.com`, sembrado en SD-101): `/app` sin cookie → 307 a
        `/login`; con cookie → renderiza; logout limpia la cookie y vuelve a redirigir.
  - [x] Llamar una server action sin sesión devuelve error de autorización (test). `lib/dal/session.test.ts`
        testea `requireSession`/`requireMembership` directamente (mock de `lib/supabase/server.ts`): sin
        sesión, sin membresía, y el caso feliz, los tres lanzan/devuelven lo esperado. (La primera versión
        de este ticket dejaba `requireSession`/`requireMembership` sin ningún caller real ni test propio —
        hallazgo de `reviewer`, corregido.)
  - [x] `lib/supabase/admin.ts` no se importa desde ningún componente ni página (regla ESLint
        `no-restricted-imports`). Amplida para cubrir también `lib/supabase.ts` (el shim de compatibilidad
        hacia `admin.ts`), con excepción para `app/api/admin/**` (deuda de SD-104) — la versión inicial solo
        bloqueaba la ruta nueva, dejando el shim como escape sin aviso (hallazgo de `security-reviewer`).
- **Nota de cierre**:
  - **Excepción puntual a la regla "no negociable" de `proxy.ts`** (aprobada explícitamente antes de
    implementarse): `@supabase/ssr` documenta el patrón de middleware como "mandatory" — sin él, un refresh
    de token que ocurre renderizando un Server Component no se puede escribir de vuelta a las cookies (son
    de solo lectura ahí), causando pérdida silenciosa de sesión. `proxy.ts` ahora llama a
    `supabase.auth.getClaims()` en cada request (menos rutas admin) solo para refrescar/persistir la cookie
    — nunca decide nada con el resultado. `CLAUDE.md` documenta la excepción explícitamente, acotada a ese
    uso exacto.
  - **`proxy.ts` tenía un bug real de enrutamiento**, encontrado verificando a mano: `/app` (fuera de
    `app/[lang]`) se reescribía a `/en/app` por la lógica de locale antes de que `verifySession()` pudiera
    redirigir a `/login`. Arreglado con una lista explícita de rutas sin locale (`/app`, `/login`,
    `/forgot-password`, `/update-password`, `/auth`).
  - **`proxy.ts` tenía un segundo bug, encontrado por `reviewer`**: la rama sin locale usaba
    `NextResponse.next()` sin `{ request }`, así que la mutación de cookies que `refreshSession()` ya había
    hecho sobre `request.cookies` nunca llegaba al render de la misma request — el propio patrón que el
    comentario del archivo dice estar evitando. Arreglado pasando `{ request }`, igual que ya hacía la rama
    de locale.
  - **`lib/supabase/browser.ts` no podía funcionar para su propio caso de uso** (hallazgo de ambos
    revisores): importaba `lib/env.ts`, cuyo schema también valida `SUPABASE_SERVICE_ROLE_KEY` (secreto de
    servidor). Next.js no inyecta esa variable al bundle del navegador, así que el primer Client Component
    que importara `createClient()` de ahí habría reventado al evaluar el módulo. Arreglado leyendo
    `process.env.NEXT_PUBLIC_*` como acceso literal (lo que sí inyecta Next.js), sin pasar por `lib/env.ts`.
    Sigue sin usarse en ningún Client Component todavía — el primer caso real llega con el dashboard.
  - **`supabase/config.toml` tenía self-signup habilitado**, contradiciendo "no self-signup en el MVP"
    (hallazgo de `security-reviewer`): con la `anon key` pública, cualquiera podía crear una cuenta propia
    vía `/auth/v1/signup` y entrar a `/app` (sin membresía, así que sin acceso a datos de ninguna org, pero
    sí abría superficie de ataque y enumeración de emails). Al corregirlo casi se rompe el login: poner
    `enable_signup = false` bajo `[auth.email]` deshabilita el proveedor de email **completo** en esta
    versión del CLI de Supabase (confirmado golpeando `/auth/v1/token` directo: `email_provider_disabled`),
    no solo el signup. La bandera correcta es la de nivel `[auth]` (`enable_signup = false`); `[auth.email]`
    se dejó en `true`. **Pendiente en el proyecto remoto**: este archivo solo controla el stack local;
    verificar/replicar en el Dashboard de Supabase (Auth → Providers) antes de ir a producción — Claude no
    puede tocar el proyecto remoto.
  - **`secure_password_change = true`** (estaba en `false`): sin esto, con solo la cookie de sesión (las de
    `@supabase/ssr` no son `httpOnly` por diseño) alguien podía cambiar la contraseña vía `/update-password`
    sin reautenticarse, convirtiendo un robo temporal de cookie en una toma de cuenta permanente. Verificado
    de punta a punta contra Supabase local (con el cambio activo) que el flujo real de recuperación —
    `/forgot-password` → email real vía Mailpit → `/auth/callback` (PKCE) → `/update-password` — sigue
    funcionando: una sesión de recuperación cuenta como suficientemente "fresca". Se agregó además
    `supabase.auth.signOut({ scope: "others" })` tras un cambio de contraseña exitoso, para que también
    cierre cualquier otra sesión activa (hallazgo de `security-reviewer`).
  - **Hallazgo preexistente, no de este diff**: `npm run dev` da 500 en `/[lang]` (sitio público) porque
    `.env.local` tiene `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` apuntando al proyecto remoto desactualizado
    (`gqqjaoarvpkiisikcopq.supabase.co`, el mencionado como `INACTIVE` en SD-001) mientras que las nuevas
    `NEXT_PUBLIC_SUPABASE_*` de este ticket apuntan correctamente al stack local — confirmado por `reviewer`
    leyendo el env real del proceso. El cliente admin (usado por `lib/property.ts` vía el shim) y los
    clientes de sesión nuevos están hablando con dos bases de datos distintas. Acción pendiente del usuario:
    alinear las 4 variables en `.env.local` al mismo proyecto.
  - **Gap conocido, fuera de alcance de este ticket**: no hay rate limiting ni captcha propio en
    `signIn`/`requestPasswordReset` — GoTrue limita por IP de **servidor** (no del atacante), así que el
    límite se comparte entre todos los usuarios reales que salen por la misma IP de Vercel (fuerza bruta
    diluida entre todos, y un atacante con ~30 intentos agota el cupo de *todos* por 5 minutos; con SMTP
    gestionado, 2 emails/hora agota el cupo de reset para todo el proyecto). Mitigación real (captcha
    Turnstile vía `options.captchaToken`, o rate limit propio por IP+email) queda para un ticket dedicado
    cuando el flujo de pagos/CRM esté más cerca y haya tráfico real que justifique la complejidad.
  - Verificación manual completa contra Supabase local con sesiones reales (no solo pgTAP, que no aplica —
    este ticket no toca migraciones): login correcto/incorrecto, logout, `/app` protegido, y el flujo
    completo de recuperación de contraseña (reset → email real vía Mailpit → exchange PKCE → nueva
    contraseña → sesión activa en `/app`). `lint`/`typecheck`/`test` (35/35)/`build` en verde;
    `supabase db reset` + `supabase test db` (37/37, sin cambios de esquema en este diff) en verde.

### [x] SD-104 · refactor: move data reads into the DAL
`M` · Depende: SD-102, SD-103 · Review: `R+S`
- **Alcance**: `lib/property.ts`, `lib/spaces.ts`, `lib/photos.ts` → `lib/dal/public/*` (cliente anon, propiedad
  explícita) con `cache()` para deduplicar por request. Eliminar la constante `PROPERTY_SLUG`.
- **Criterios**
  - [x] El sitio de Saywa renderiza idéntico. Verificado contra Supabase local en modo producción
        (`npm run build && npm start`): `/es`/`/en` dan 200, mismo `<title>`, mismas fotos (`property-photos`
        presente en el HTML).
  - [x] Cada request hace una sola consulta de propiedad (verificado con logs). Confirmado con un
        `console.log` temporal (ya removido): **1** consulta real en modo producción. En `npm run dev` salían
        2 — es el doble-render conocido de Turbopack dev mode, no un fallo de `cache()` (que solo dedupe
        dentro de una misma request/render, y en dev cada render-pass es técnicamente una request nueva para
        ese propósito); `reviewer` confirmó esta lectura contra la documentación de Next.js sobre `cache()`.
  - [x] Ningún archivo fuera de `lib/dal` importa clientes Supabase. Verificado con `grep`: solo
        `lib/dal/**`, `lib/supabase/**` y `proxy.ts` (excepción ya aprobada de SD-103, documentada en
        `CLAUDE.md`) importan `@supabase/supabase-js`/`@supabase/ssr` directamente.
- **Nota de cierre**:
  - **Dos desviaciones del texto literal del criterio, intencionales**, señaladas por `reviewer`:
    1. "Eliminar la constante `PROPERTY_SLUG`" — no se eliminó, se **trasladó** a `config/site.ts`,
       documentada como temporal hasta SD-105 (que la sustituye por resolución real desde el host). El
       espíritu del criterio sí se cumple: `getProperty()` ya no la lee internamente, la recibe como
       parámetro explícito — los callers son quienes la importan ahora.
    2. Los 3 route handlers de `app/api/admin/{content,logo,photos}/route.ts` siguen importando el shim de
       service-role (`@/lib/supabase`) para sus propias mutaciones — solo cambió de dónde obtienen
       `property.id`/`org_id` (ahora vía el DAL público, antes vía el mismo `getProperty()` pero con
       service-role). Un DAL propio para el dashboard/admin no existe todavía (Fase 2, SD-201/202); hacerlo
       aquí habría sido alcance fuera de este ticket.
  - **Hallazgo real de `reviewer`, corregido**: como consecuencia del punto 2, las 7 llamadas a
    `getProperty(PROPERTY_SLUG)` en esas 3 rutas quedaron sin `try/catch` — antes usaban service-role
    (ignora RLS, nunca falla por `published`), ahora usan el cliente anon (sujeto a `is_member(org_id) OR
    published`). Si la propiedad alguna vez tuviera `published = false` (mantenimiento, o antes del primer
    publish), estas rutas habrían devuelto un error no controlado en vez del JSON genérico que define
    `lib/api-error.ts`. Se envolvieron las 7 llamadas en `try/catch` + `serverError(...)`, consistente con
    el resto de cada handler.
  - **Hallazgo real de `security-reviewer`, corregido**: `lib/dal/public/*` (pensado como 100% cliente
    `anon`) dependía de `lib/supabase/admin.ts` solo para `getPublicPhotoUrl`/`PHOTOS_BUCKET` — ninguna
    fuga real (es construcción pura de URL, sin llamada de red), pero contradecía el objetivo del ticket.
    Se movieron a `lib/storage.ts`, sin ningún cliente Supabase (verificado que `encodeURI(...)` sobre la
    URL completa replica exactamente lo que hace `@supabase/storage-js` internamente).
  - **Segundo hallazgo de `security-reviewer`, corregido**: la regla ESLint `no-restricted-imports` solo
    comparaba el specifier exacto (`paths`), así que un import relativo (`../lib/supabase/admin`) la
    esquivaba. Se añadieron `patterns` (`**/lib/supabase/admin`, `**/lib/supabase/anon`) para cerrarlo —
    verificado que ahora sí dispara contra un import relativo de prueba.
  - `lint`/`typecheck`/`test` (35/35)/`build` en verde. Sin migraciones → sin `supabase test db`.

### [x] SD-105 · feat(routing): host-based tenant resolution
`L` · Depende: SD-104 · Review: `R+S`
- **Alcance**: `proxy.ts` reescribe `{sub}.<root>` y dominios propios a `/sites/[host]/[lang]/...`,
  `app.<root>` a `/app/...`; mover `app/[lang]` a `app/sites/[host]/[lang]`; `<html lang>` en el layout del sitio
  (sin `headers()` en el root); `getSiteByHost()` cacheado; metadata, `sitemap.ts`, `robots.ts` y JSON-LD por host;
  `ROOT_DOMAIN` en `lib/env.ts`.
- **Criterios**
  - [x] `saywa-lodges.localhost:3000/es` y `demo.localhost:3000/es` muestran contenido distinto. Verificado
        con `curl -H "Host: ..."` contra Supabase local: nombres/fotos/rooms de cada property seminada aparecen
        correctamente (p. ej. "Demo Lodge"/"Demo Room" solo en el segundo).
  - [x] Host desconocido → 404; propiedad no publicada → 404. Verificado: host inexistente → 404; se
        despublicó `saywa-lodges` directo en la BD → 404, se revirtió → 200 de nuevo.
  - [x] `sitemap.xml` y canonical usan el host del tenant. Verificado con curl para ambos subdominios
        (hosts distintos en las URLs devueltas); el canonical/og:url tenían un bug real (ver nota de cierre,
        hallazgo F1) ya corregido y reverificado.
  - [x] ADR 0001 actualizado si cambia algo del diseño. Se añadió la mecánica concreta (`ROOT_DOMAIN`,
        `getSiteByHost`, root layouts múltiples, el hallazgo de seguridad sobre rutas compartidas).
- **Nota de cierre**:
  - **`ROOT_DOMAIN` con default en local**: inicialmente obligatorio, bloqueaba al usuario sin poder editar
    `.env.local` él mismo en el momento. Se le dio un default (`localhost:3000`, ya documentado en
    `CLAUDE.md`) para que el dev local funcione sin configuración — en producción, si falta de verdad
    (`NODE_ENV === "production"` sin la variable), `lib/env.ts` lanza en vez de degradar en silencio a
    "todo host real se trata como dominio propio desconocido" (hallazgo de `security-reviewer`, H5).
  - **Tres hallazgos reales de `security-reviewer`, corregidos antes de cerrar**:
    1. El header `Host` es controlable por quien hace la request (no solo por navegadores normales) y el
       parser HTTP de Node acepta ahí caracteres que no son válidos en un hostname real. Sin validarlo,
       un `Host` como `x/../../app` podía, en teoría, hacer que el rewrite a `/sites/${siteIdentifier}...`
       se saliera de ese árbol. Se añadió una validación estricta de formato hostname antes de usar el
       valor para cualquier cosa, con `encodeURIComponent` también al construir el path del rewrite.
    2. `/sites/*` era alcanzable como ruta literal en el dominio raíz (la rama "landing" no filtraba el
       path) — cualquiera podía abrir `<ROOT_DOMAIN>/sites/<tenant>/es` y ver el sitio de un tenant bajo el
       dominio de la plataforma. No expone datos ocultos (RLS solo deja ver propiedades publicadas), pero
       permite contenido duplicado y suplantación visual. Ahora `/sites/*` siempre da 404 como ruta de
       entrada — solo es alcanzable internamente, vía `NextResponse.rewrite`.
    3. **El más serio de los tres**: las rutas compartidas (`/login`, `/app`, `/admin`, etc.) se servían en
       cualquier host, incluido un futuro dominio propio de un tenant (SD-604). Una vez exista esa
       posibilidad, un tenant podría mandar a alguien a `https://su-dominio.com/login` (página legítima,
       TLS válido) y quedarse con las cookies de sesión (`sb-*`) o las credenciales Basic Auth de `/admin`
       asociadas a su propio dominio. Hoy no es explotable (nadie puede escribir `custom_domain` todavía),
       pero el arreglo es gratis ahora y evita tener que tocar `proxy.ts` otra vez cuando SD-604 exista:
       estas rutas ahora solo responden en `app.<ROOT_DOMAIN>` (o la raíz, para `/admin`); en cualquier
       otro host, 404.
  - **Hallazgo real de `reviewer`, corregido**: `app/sites/[host]/[lang]/layout.tsx` usaba el route param
    `[host]` (que es solo el `siteIdentifier` sin el sufijo, p. ej. `"saywa-lodges"`) para construir
    `canonical`/`og:url`/JSON-LD `url` — producía URLs rotas como `https://saywa-lodges/es` (sin el dominio
    completo). Se corrigió leyendo el host real vía `headers()` solo para esto (no para `<html lang>`, que
    sigue viniendo del route param como pide el ADR) — reverificado con curl que el canonical ahora es
    `http://saywa-lodges.localhost:3000/es`, correcto.
  - **Otros hallazgos menores de ambos revisores, corregidos**: errores de BD en `getSiteByHost` y en los
    `catch` de `resolveSite`/`SitePage` se tragaban sin loguear (un fallo real de Supabase se habría visto
    igual que "host desconocido", sin rastro en logs) — ahora todos logean con `console.error` antes de
    devolver `null`/`notFound()`; `app/sitemap.ts`/`app/robots.ts` duplicaban la lógica de extraer el
    `siteIdentifier` del host — se extrajo a `siteIdentifierFromHost()` en `lib/dal/public/site.ts`,
    compartida entre los dos (no con `proxy.ts`, que se mantiene deliberadamente sin importar `lib/dal`,
    autocontenido y sin tocar la BD, por diseño del ADR); comentario desactualizado en
    `lib/validation/admin.ts` que referenciaba la ruta vieja `app/[lang]/layout.tsx`.
  - `lint`/`typecheck`/`test` (38/38)/`build` en verde. Sin migraciones → `supabase test db` (37/37) sin
    cambios, solo para confirmar que nada se rompió.

### [x] SD-106 · feat(dashboard): authenticated dashboard shell
`M` · Depende: SD-103, SD-105 · Review: `R+S`
- **Alcance**: shadcn/ui inicializado; layout del dashboard mobile-first (navegación: Reservas, Calendario, Cotizar,
  Huéspedes, Sitio, Tarifas, Ajustes, con secciones vacías); selector de org si el usuario tiene más de una; enlace
  "Ver mi sitio".
- **Criterios**
  - [x] Usable a 375 px de ancho. Verificado con capturas reales (Chrome headless), logueado: sidebar en
        desktop, barra inferior en móvil, selector de org y tarjetas de página, todo legible a 375px.
  - [x] Usuario sin membresías ve un estado vacío claro, no un error. Verificado creando un usuario de
        prueba local sin `memberships` (borrado después): mensaje centrado + botón de cerrar sesión, sin
        sidebar ni nav.
- **Nota de cierre**:
  - El chequeo de sesión real y autoritativo sigue en cada página (`verifySession()`, como ya documentaba
    `lib/dal/session.ts`) — el layout también lo llama, pero solo para construir el shell visual (nombre de
    org, nav, enlace al sitio), consistente con que las layouts no se re-ejecutan en navegación parcial.
  - `lib/dal/organizations.ts` (nuevo): `getUserOrganizations`, `getOrgProperty` — mismo patrón que
    `session.ts` (funciones puras que reciben el cliente Supabase, testeables con un stub). Sin migración
    nueva: las políticas RLS existentes (`private.is_member`) ya permiten estas lecturas.
  - `lib/domain/org-selection.ts` (nuevo): `resolveActiveOrgId` pura, probada por separado del I/O de la
    cookie (`active-org-id`, mismo mecanismo que `dashboard-theme` de SD-107).
  - `lib/dal/organizations.ts#requireActiveOrg` (nuevo): única forma sancionada de obtener "la org activa de
    este request" — sesión + membresías + cookie, todo verificado contra la BD. `app/app/layout.tsx` y
    `app/app/page.tsx` lo usan en vez de repetir la lógica a mano, para que ningún ticket futuro (SD-406,
    SD-303, …) acabe leyendo `cookies().get("active-org-id")` directo y confiando en un valor que el cliente
    puede manipular.
  - **Decisión de arquitectura real, no anticipada en el plan**: los 7 `NavItem` (con sus iconos de
    `lucide-react`) viven dentro de `components/dashboard/dashboard-nav.tsx` ("use client"), no en
    `app/app/layout.tsx` (servidor). Un componente de ícono es una referencia a función; pasarlo como prop
    de servidor a cliente rompe el build ("Only plain objects can be passed to Client Components...").
    Se detectó probando el login real, no solo por tipos — `tsc`/build no lo marcan porque `NavItem` tipa
    `icon` como `LucideIcon`, válido en ambos lados.
  - `components/dashboard/` usa solo `components/ui/*`, igual que el resto del dashboard (sin estilos
    sueltos). `components/dashboard/org-switcher.tsx` valida el `orgId` en el servidor antes de guardar la
    cookie — nunca confía en el valor del cliente.
  - **Hallazgos de `security-reviewer`, corregidos**: `setActiveOrg` no validaba su entrada con zod (el
    tipo `orgId: string` solo existía en TypeScript) y reimplementaba a mano la comprobación de membresía
    que ya existe en `lib/dal/session.ts#requireMembership` — se cambió a
    `z.object({ orgId: z.uuid() }).parse(...)` + `requireMembership(orgId)`, y se quitó `isOrgMember`
    (duplicaba `getMembership`). Además, el riesgo señalado de que un ticket futuro confiara en la cookie
    sin pasar por una comprobación de membresía real quedó resuelto con `requireActiveOrg` (arriba).
  - **Hallazgos de `reviewer`, corregidos**:
    - `<html lang="en">` con todo el contenido en español (copiado del placeholder de SD-103). Se cambió a
      `lang="es"` en las dos ramas del layout. Decisión explícita, no un olvido: el dashboard queda en
      español fijo en este ticket (sin `dictionaries/`) — confirmado con el usuario antes de implementar;
      localizarlo es un ticket aparte, para cuando haya páginas con contenido real que lo justifique.
    - `getUserOrganizations` convertía un error de BD en lista vacía, indistinguible de "el usuario
      legítimamente no tiene organizaciones" — con un blip transitorio de Supabase, un miembro real vería
      "pídele a alguien que te invite" en vez de un error genérico. Ahora `getUserOrganizations` lanza en
      ese caso (documentado como excepción deliberada al patrón de `lib/dal/*`); `app/app/layout.tsx`
      atrapa el error con `unstable_rethrow()` primero (para no interceptar el redirect a `/login` de
      `verifySession()`) y muestra un mensaje distinto ("no pudimos cargar tu organización, intenta de
      nuevo") en vez de la copy de "sin organización".
    - Sin `order by` en `getUserOrganizations`, el fallback "primera org" de `resolveActiveOrgId` (sin
      cookie, primer login) no era estable entre cargas. Se ordena por antigüedad de la membresía.
    - `OrgProperty.subdomain` tipado `string | null` cuando la columna es `not null` — ajustado a `string`.
    - Enlace "Ver mi sitio" (`target="_blank"`) sin indicación para lectores de pantalla — se agregó texto
      `sr-only` ("se abre en una pestaña nueva").
    - No corregido, anotado para cuando `/app/bookings` y el resto tengan contenido real: cambiar de
      org desde una sección que no sea el home redirige a `/app` en vez de quedarse en esa sección.
  - `lint`/`typecheck`/`test` (64/64)/`build` en verde. Sin migraciones → sin `supabase test db`.

### [x] SD-107 · feat(ui): dashboard design system
`M` · Depende: — (hacerlo antes o junto con SD-106, que lo usa) · Review: `R`
- **Objetivo**: que el dashboard se vea como un producto profesional y consistente desde la primera pantalla, no
  como un formulario de administración.
- **Alcance**: shadcn/ui sobre Tailwind v4; tokens de diseño en un solo lugar (CSS variables en `app/globals.css`:
  primario, acento, neutros, éxito/alerta/error, radios, sombras, tipografía), de modo que la paleta de Saywa
  Direct se cambie sin tocar componentes; modo claro y oscuro. Componentes base: botones, inputs, select, selector
  de fechas, tablas con estados vacío/cargando/error, tarjetas de métricas, badges de estado (confirmada,
  pendiente, bloqueada), toasts, diálogos de confirmación, sidebar en escritorio y barra inferior en móvil.
  Página interna `/app/ui` (solo en desarrollo) que muestra todos los componentes. Guía breve en `docs/design.md`
  (paleta, tipografía, espaciado, cuándo usar cada componente).
- **Criterios**
  - [x] Cambiar 1–2 variables recolorea todo el dashboard (verificado con una paleta alternativa). Verificado de
        verdad, no solo por construcción: cambié `--primary`/`--accent` a verde temporalmente, reconstruí, y
        confirmé en el CSS compilado que el hex viejo desaparece por completo (0 ocurrencias) y el nuevo aparece
        en las 10 utilidades que usan `var(--primary)` — luego revertí.
  - [x] Contraste de texto AA (WCAG) en modo claro y oscuro. Calculado programáticamente (luminancia relativa
        W3C): los 8 pares principales (texto/fondo, texto sobre `primary`, texto secundario, texto sobre
        `accent`) y los 6 pares de `StatusBadge`/`MetricCard` — los 14, ≥4.5:1 en ambos modos.
  - [x] Las pantallas del dashboard usan solo componentes de `components/ui` (sin estilos sueltos). Auditoría
        con `grep`: cero hex/rgb hardcodeado en `components/ui/*` ni en `app/app/{page,layout,ui/page}.tsx`.
  - [~] Usable a 375 px de ancho. Los patrones responsive están ahí (`hidden md:flex`/`md:hidden`,
        `overflow-x-auto` en la tabla, `truncate` en las etiquetas de la barra inferior) y verificados por
        código, pero **no confirmados visualmente** — no hay navegador/herramienta de captura en este entorno.
        Pendiente de que el usuario lo confirme en DevTools antes de considerarlo cerrado de verdad.
- **Nota de cierre**:
  - **Decisión de arquitectura**: los tokens del dashboard viven en `.dashboard`/`.dashboard.dark` (nunca en
    `:root`), para no colisionar con los tokens del sitio público (mismos nombres semánticos que usa shadcn:
    `--background`, `--primary`, etc., ya en uso por `app/globals.css` desde antes de este ticket).
  - **Modo oscuro sin `next-themes`**: esa librería asume que controla `<html>` globalmente; el modo oscuro
    aquí es solo del dashboard. `next-themes` se instaló solo (dependencia transitiva del wrapper de `sonner`
    de shadcn) — se desinstaló y se editó `components/ui/sonner.tsx` a mano para recibir `theme` por prop.
    Mecanismo real: cookie `dashboard-theme` leída server-side en `app/app/layout.tsx`.
  - **Hallazgo real de `reviewer`, corregido**: `StatusBadge` y el indicador de tendencia de `MetricCard`
    usaban `bg-success/bg-warning/bg-destructive text-white` — un verde/ámbar sólido con texto blanco no pasa
    AA en ninguno de los dos modos (hasta 2.15:1 en oscuro, verificado independientemente). No existe un color
    que sirva a la vez como "fondo sólido con texto blanco" y "texto plano sobre el fondo de página" en ambos
    temas, así que se quitaron `--success`/`--warning` como tokens compartidos y se usan paletas literales de
    Tailwind por contexto (`green-100`/`green-800` + `dark:green-950`/`dark:green-300`, etc.), cada combinación
    verificada por separado — todas ≥4.5:1.
  - **Otros hallazgos de `reviewer`, corregidos**: `aria-current="page"` faltante en el link activo de
    `SidebarNav`/`MobileBottomNav`; cookie de tema sin `Secure` (ahora condicional a `https:`, para no romper
    el dev local sobre `http`); nota añadida en `docs/design.md` aclarando que `cn` viene del paquete npm
    `"cn"`, no de `@/lib/utils` (esta versión del CLI de shadcn no genera ese archivo).
  - Fuera de alcance, anotado para otro ticket: 13 vulnerabilidades de `npm audit` (1 crítica) preexistentes
    en el árbol de dependencias — Next.js 16.2.6 pinneado vs 16.4.2 con fixes, tooling de eslint. Ninguna viene
    de los paquetes añadidos en este ticket (shadcn/Radix/sonner/date-fns/react-day-picker/`cn`).
  - `app/app/page.tsx` (la página protegida mínima de SD-103) se restyled con `Card`/`Button` del sistema
    nuevo — fuera del alcance literal original, pero es la única página real donde un usuario logueado puede
    ver el sistema, así que se incluyó deliberadamente para que no quedara una isla con el estilo viejo.
  - `lint`/`typecheck`/`test` (35/35)/`build` en verde. Sin migraciones → sin `supabase test db`.

---

## Fase 2 — Contenido, unidades y tarifas (M2)

### [x] SD-201 · feat(dashboard): property settings
`M` · Depende: SD-106 · Review: `R+S`
- **Alcance**: formulario de información, contacto/WhatsApp, dirección y coordenadas, SEO es/en, logo, tema
  (color primario/acento); server actions + zod; `revalidateTag('property:<id>')` al guardar.
- **Criterios**
  - [x] Cambios visibles en el sitio público tras guardar, sin redeploy. Verificado de verdad: guardé un
        meta title nuevo desde el dashboard y `saywa-lodges.localhost:3000/es` lo mostró en el `<title>`
        al instante, sin reiniciar el servidor — la ruta pública ya es 100% dinámica, no hay nada que
        invalidar (ver nota de `revalidateTag` abajo).
  - [x] Validación de errores por campo en la UI. Probado con un `mapsUrl` inválido (`javascript:...`):
        error inline en rojo bajo el campo, sin guardar, sin toast.
  - [x] Staff puede editar; un usuario de otra org no. Lo primero, probado en el navegador con
        `owner@saywalodges.com`. Lo segundo lo garantiza RLS (`properties_update using
        is_member(org_id)`), con test pgTAP real: `supabase/tests/0005_property_settings_isolation.test.sql`
        (ver nota de cierre — `0003_org_isolation.test.sql` no probaba UPDATE sobre `properties`, solo
        sobre `rooms`; corregido tras el hallazgo de `security-reviewer`).
- **Recortes de alcance frente al texto de arriba, documentados antes de implementar (ver también el plan
  aprobado de este ticket)**:
  - **Sin logo todavía.** `storage.objects` no tiene ninguna policy de RLS para `authenticated` — es
    trabajo explícito de SD-202 ("movido desde SD-102"), que además define el prefijo `{org_id}/...` que
    esas policies van a exigir. La única alternativa sería la service-role key en una server action de
    usuario, prohibido por `CLAUDE.md`. `logo_path` ya tiene grant de `update` desde antes de este ticket
    (`20261016230028_row_level_security_policies.sql`), así que el selector de logo se puede sumar a esta
    misma página cuando SD-202 agregue esas policies, sin tocar el resto del formulario.
  - **Sin color primario/acento.** SD-210 es el ticket dedicado a todo el tema (presets, colores,
    tipografía, radio, aviso de contraste) — duplicarlo aquí con una versión reducida no tenía sentido.
    `theme`/`content` siguen sin grant de escritura hasta SD-210.
  - **Sin `revalidateTag`.** `app/sites/[host]/[lang]/page.tsx` ya es 100% dinámico (`ƒ`, sin ninguna
    directiva de cache) — no hay nada que invalidar hoy, confirmado arriba con la prueba real. Se agrega
    el día que el sitio público tenga una capa de cache de verdad.
- **Nota de cierre**:
  - **Bug real encontrado probando el flujo en el navegador, no por tipos/build**: al fallar la
    validación de un campo, el formulario perdía los cambios sin guardar de *todos* los demás campos
    también, no solo el inválido — `app/app/site/page.tsx` recarga `initial` fresco de la BD en cada
    render, y Next vuelve a renderizar ese segmento después de que corre la server action, lo que
    reaplica el `defaultValue` original a cada `<input>` no controlado. Arreglado haciendo que
    `updateSettings` devuelva los valores exactamente como se enviaron (`UpdateSettingsState.values`) y
    que `SettingsForm` los prefiera sobre `initial` una vez que hubo al menos un intento de guardado.
    Verificado con eventos de teclado reales (no solo asignar `.value` por JS) antes y después del fix.
  - `lib/dal/property.ts` (nuevo, autenticado) es deliberadamente distinto de `lib/dal/public/property.ts`
    (anon) — mismo patrón de separación ya usado para `lib/dal/organizations.ts`.
  - `components/ui/sonner.tsx#Toaster` se monta ahora en `app/app/layout.tsx` (antes solo se usaba en la
    página de muestra `/app/ui`) — este es el primer ticket del dashboard real que necesita confirmar un
    guardado; queda disponible para cualquier página futura.
  - **Hallazgos de `security-reviewer`, corregidos**:
    - El criterio "un usuario de otra org no puede editar" se daba por cubierto por un test que en
      realidad solo probaba `rooms`, no `properties` (que es justo la tabla que escribe este ticket).
      Migración nueva `20261022060256_property_org_id_unique.sql` (`unique(org_id)` en `properties` — ver
      punto siguiente) + test nuevo `0005_property_settings_isolation.test.sql`, con la aserción real:
      un UPDATE de otra org sobre `properties.name` afecta 0 filas.
    - `updatePropertySettings` reportaba éxito aunque el UPDATE afectara 0 filas (RLS filtrando una
      escritura entre orgs, o una org sin propiedad) — se le agregó `.select("id")` y se verifica
      `data.length === 1`.
    - `properties.org_id` no tenía `unique` — el código de este ticket escribe `where org_id = $1`
      asumiendo una propiedad por org, invariante real hoy pero nunca forzado en la BD. Se agregó el
      constraint (migración de arriba): si alguna vez una org tuviera dos propiedades, este UPDATE
      sobrescribiría ambas con los mismos datos sin avisar.
    - El `refine` de `httpsUrlOrEmpty` (`lib/domain/property-settings.ts`) aceptaba variantes
      (`HTTPS://…`, con espacio inicial) que el parser WHATWG normaliza pero que la CHECK de BD
      (`~ '^https://'`, sensible a mayúsculas) rechaza — guardar fallaría con un error genérico de BD en
      vez de un error de campo. Se agregó `startsWith("https://")` explícito, igual que la CHECK.
  - **Hallazgo crítico de `reviewer`, corregido**: al agregar el chequeo de filas afectadas de arriba, el
    parámetro de `updatePropertySettings` se llamaba `data` igual que la respuesta de Supabase — al
    destructurar solo `{ error }` (sin capturar `data` de la respuesta), `data.length` dentro del `if`
    resolvía al parámetro (sin `.length`), así que en runtime la función devolvía `{ ok: false }`
    *siempre*, aunque el guardado funcionara. `tsc` lo marcaba, pero valía confirmarlo con el flujo real:
    renombrado el parámetro a `settings` y la respuesta a `{ data: updated, error }`, y reverificado
    guardando un cambio real en el navegador antes de cerrar el ticket.
  - **Hallazgos menores de `reviewer`, corregidos**: `role="alert"` en los errores de campo (antes solo se
    anunciaban al tabular hasta el campo); label de `mapsUrl` sin "(opcional)" aunque el esquema sí lo
    permite vacío, igual que `airbnbUrl`; `<Toaster>` duplicado en `/app/ui` (ya lo provee
    `app/app/layout.tsx` para todo el dashboard).
  - `lint`/`typecheck`/`test` (78/78)/`build` en verde. `npx supabase db reset && npx supabase test db`
    en verde (47/47, incluye `0005_property_settings_isolation.test.sql`).

### [x] SD-202 · feat(dashboard): site content and photo manager
`L` · Depende: SD-201 · Review: `R+S`
- **Alcance**: migración `rooms` → `spaces`; CRUD de spaces, amenities y distances con reordenamiento; gestor de fotos
  (hero, galería, por espacio) con validación de tipo/tamaño, rutas nuevas con prefijo `{org_id}/...`, borrado de
  Storage consistente (RPC o compensación). **Incluye lo movido desde SD-102**: políticas de RLS en
  `storage.objects` (insert/update/delete solo si `(storage.foldername(name))[1]::uuid` es una org de la que el
  usuario es miembro; lectura pública sin cambios, el bucket ya es público) y migrar las 27 rutas reales de
  Saywa Lodges al nuevo prefijo — mover los objetos en Storage y actualizar `photos.storage_path`/
  `properties.logo_path` en una sola operación verificada (mismo patrón de script + verificación que
  `scripts/seed-content.mjs` en SD-001), confirmando que cada foto sigue cargando en el sitio después del move.
- **Criterios**
  - [x] Reordenar y guardar persiste el orden en el sitio (RPCs atómicas `reorder_*`; el sitio público es dinámico).
  - [x] Borrar un espacio borra sus fotos de BD y Storage (objetos primero, luego la fila; verificado contra Supabase local).
  - [x] Las fotos de espacios ya son editables (antes no lo eran).
  - [x] Las 27 fotos reales migradas a `{org_id}/...` en producción, según confirmación del usuario
        al iniciar SD-203 (main `6f2e772`). No se repitió la verificación remota en SD-203.
  - [x] Un usuario de otra org no puede subir/borrar en el prefijo de otra (pgTAP `0006` + prueba real con sesiones).
- **Entrega**: dos PRs. PR A (#9): rename `rooms`→`spaces`, bucket y políticas de `storage.objects`, rutas con prefijo
  de org, script de migración de producción, pgTAP `0006`. PR B: RPCs de orden/hero (`0007`), dominio
  `lib/domain/content-manager.ts`, DAL `lib/dal/content.ts` y `lib/dal/photos.ts`, y `/app/site/{spaces,amenities,distances,photos}`
  con logo, foto principal, reorden y borrado confirmado.
- **Nota de cierre**:
  - El borrado de Storage va por compensación en el DAL (sin service-role): subir = objeto y luego fila (si la fila
    falla se borra el objeto); borrar = objeto y luego fila (un fallo se puede reintentar). `storage.remove` devuelve
    éxito aunque RLS omita el objeto, así que se compara cuántos se borraron (hallazgo de review).
  - Borrar la foto principal promueve la siguiente del sitio.
  - Los formularios no se probaron en un navegador (no hay Playwright en el repo); sí las páginas con sesión real y el
    flujo del DAL contra Supabase local.
  - Fuera de alcance / pendiente: dos pestañas moviendo a la vez pueden perder un movimiento (read-modify-write sin
    versión); dos primeras subidas simultáneas podrían dejar dos `hero` (un índice único parcial lo evitaría).
    El script inicial de carga con rutas legacy se retiró en SD-203; el seed vigente es `supabase/seed.sql`.
  - Migraciones y rutas de fotos aplicadas en producción según confirmación del usuario al iniciar SD-203.
    Esta confirmación no sustituye la revisión remota de `get_advisors` pendiente en SD-102.

### [x] SD-203 · chore: remove legacy admin
`S` · Depende: SD-202 · Review: `R+S`
- **Alcance**: eliminar `app/admin`, `app/api/admin/*`, Basic Auth de `proxy.ts`, variables `ADMIN_*`.
- **Criterios**
  - [x] `/admin` → 404; sin referencias a las variables de credenciales de Basic Auth en archivos versionados.
- **Nota de cierre**:
  - Eliminados el panel antiguo, sus tres APIs, validaciones, alias de service-role, helper de errores sin
    consumidores y script inicial de carga. Retirada Basic Auth de `proxy.ts` y su excepción de ESLint;
    se conservan las restricciones de importación del cliente service-role.
  - Los hosts de plataforma usan rutas nativas (incluido 404 para rutas inexistentes); los tenants conservan
    enrutamiento por idioma y host, bloqueo de `/sites/*` directo y aislamiento de rutas de sesión/dashboard.
  - El usuario aceptó retirar temporalmente la edición de `rate_tiers`: los valores publicados siguen
    visibles; el modelo nuevo llega en SD-205/206 y la pantalla de edición en SD-207.
  - `lint`, `typecheck`, 99 tests y `build` en verde. Se regeneraron tipos de rutas con `next typegen`
    para eliminar referencias locales obsoletas; el build necesitó acceso de red para descargar Google Fonts.
  - HTTP contra el servidor de desarrollo local: `/admin` y las tres APIs devuelven 404 en hosts de plataforma,
    incluidas mutaciones; Saywa es/en y demo devuelven 200. Sin sesión, `/app/site` redirige al login;
    con el usuario owner local, las cinco pantallas de `/app/site/*` devuelven 200 con contenido esperado.
    Rutas de dashboard/login en tenant y acceso directo a `/sites/*` devuelven 404.
  - Revisiones `reviewer` y `security-reviewer` aprobadas; corregido un comentario obsoleto en el layout de plataforma.
    Sin cambios de esquema, migraciones ni BD remota; `.env.local` sin modificar.
  - Despliegue: el usuario retira las dos credenciales antiguas de Vercel después de desplegar este PR.
    Push y apertura del PR pendientes de confirmación; el cierre documental no implica merge ni despliegue.

### [x] SD-204 · feat: bookable units
`M` · Depende: SD-106 · Review: `R+S`
- **Alcance**: tabla `units` (kind `entire_place|room`, `max_guests`, `included_guests`, `active`); CRUD en dashboard;
  seed de Saywa (casa entera y/o habitaciones).
- **Criterios**
  - [x] Una propiedad admite múltiples unidades; desactivar una la excluye del inventario público activo.
        `lib/dal/public/units.ts#getActiveUnits` prepara la consulta para el futuro cotizador (SD-402/404);
        aún no hay cotizador en el que comprobar visualmente el selector.
  - [x] pgTAP de aislamiento, permisos y constraints: `0008_units.test.sql` (29 asserts).
- **Nota de cierre**:
  - Tabla `units` separada de los espacios de la galería: nombre, tipo, capacidades, estado y timestamps.
    FK compuesta `(property_id, org_id)`, RLS por operación y permisos por columna impiden cambiar
    identidad/organización/propiedad/timestamps por REST. Anon solo lee unidades activas de propiedades publicadas;
    los miembros administran también las inactivas y las de su propia propiedad no publicada.
  - Dashboard `Sitio → Unidades` (`/app/site/units`): listado, alta, edición, activar/desactivar y borrado confirmado.
    Server actions con sesión y membresía, zod, DAL con filtros por org y comprobación de filas afectadas.
    `ContentForm` admite ahora campos numéricos, reutilizando el patrón de errores y valores preservados.
  - Seed local: Saywa como casa completa para 13 huéspedes (13 incluidos como ejemplo hasta SD-205/207)
    y demo como habitación para 4 (2 incluidos). No se crean unidades ni se fijan precios en producción.
  - Migración nueva `20261022230307_bookable_units.sql`, reconstrucción local y tipos regenerados en
    `lib/database.types.ts` (ubicación vigente del repo). Reversión destructiva documentada en la migración.
  - `lint`, `typecheck`, 113 tests y `build` en verde; `supabase db reset --local` y 108 asserts pgTAP en verde.
    Prueba HTTP real con owner local: listado propio, formularios, creación, rechazo de capacidad inválida,
    edición, activación/desactivación y eliminación; unidad inactiva fuera de inventario público; acceso a
    unidad ajena o ID inválido → 404; página y acción sin sesión → login. Se retiraron los datos temporales.
  - `reviewer`: aprobado; `security-reviewer`: sin hallazgos. La interacción visual y el ancho móvil no se
    verificaron: Computer Use quedó pendiente de permisos del sistema; HTTP no sustituye esa verificación.
  - Sin cambios en BD remota ni `.env.local`. Para desplegar: aplicar primero la migración por el procedimiento
    del proyecto; crear las unidades reales desde el dashboard después del deploy (el seed es solo local).
    Publicación del PR y despliegue pendientes; el marcado del ticket refleja implementación y verificación local.

### [x] SD-205 · feat(db): seasons, unit rates and fees
`M` · Depende: SD-204 · Review: `R+S`
- **Alcance**: `seasons` (rango de fechas, prioridad), `unit_rates` (base o por temporada: `nightly_cents`,
  `weekend_nightly_cents`, `extra_guest_cents`, `min_nights`), `fees` (`per_stay|per_night|per_guest`),
  `currency` en `properties`; `check` constraints (montos ≥ 0, `end_date > start_date`).
- **Criterios**
  - [x] Constraints rechazan datos inválidos (pgTAP).
  - [x] Seed con tarifas de Saywa: referencias existentes USD 220/300 para base/alta y USD 500 por noche
        de feriado confirmado por el propietario. Incluye los 16 feriados nacionales del calendario 2027,
        prioridad 20 sobre 10 de temporada alta; sin puentes ni regionales. Cada fecha cubre su noche `[fecha, fecha+1)`.
        El año del seed, mínimo de 1 noche y extra de 0 siguen siendo ejemplos locales.

- **Avance de implementación**:
  - Migración aditiva `20261023030950_seasons_unit_rates_and_fees.sql`: moneda PEN/USD por propiedad,
    temporadas con fechas finitas `[inicio, fin)` y prioridades, tarifas base/temporada por unidad y cargos
    por estancia/noche/huésped. Sin tarifas nuevas en producción; no reemplaza todavía `rate_tiers`.
  - Importes enteros no negativos en céntimos; fin de semana nullable (usar tarifa normal), mínimo de noches
    positivo. Una base por unidad y una tarifa por unidad/temporada. Solapes entre temporadas de distinta
    prioridad permitidos, empates solapados rechazados. Detalles y cascadas en ADR 0005.
  - RLS por operación y grants por columna; FKs compuestas mantienen org/propiedad/unidad/temporada.
    Índices de exclusión/unicidad incluyen org_id para impedir inferencias de datos privados mediante
    errores distintos antes de validar FKs (hallazgo de revisión corregido y cubierto por regresiones).
  - Tipos regenerados desde Supabase local en `lib/database.types.ts`. Seed de dos organizaciones;
    feriado y cargo de demo expresamente ficticios; Saywa usa el precio de feriado confirmado por el propietario.
  - Verificación: reconstrucción local, 208 asserts pgTAP (100 nuevos), 113 pruebas unitarias, lint,
    typecheck y build en verde. `reviewer` aprobado; `security-reviewer` sin hallazgos tras correcciones.
  - No añade UI ni cotizador: motor en SD-206, editor en SD-207. Sin cambios en BD remota o `.env.local`.
    Precio de feriados confirmado por el usuario al completar el seed. PR y despliegue pendientes;
    el marcado refleja implementación y verificación local. Referencias de calendario en ADR 0005.

### [x] SD-206 · feat(domain): pricing engine
`M` · Depende: — (tipos de SD-205) · Review: `R`
- **Alcance**: `lib/domain/pricing.ts` puro: `quoteStay({ rates, seasons, fees, checkIn, checkOut, guests })` →
  desglose por noche, fees, total, adelanto (`deposit_percent`), errores tipados (mínimo de noches, capacidad).
  Temporada de mayor prioridad gana; fin de semana = noches de viernes y sábado.
- **Criterios**
  - [x] Cobertura ≥ 90 %: motor al 100 % en líneas, sentencias, funciones y ramas.
  - [x] Casos: cruce de temporadas, feriado dentro de temporada, huéspedes extra, mínimo de noches por temporada
        de la noche de llegada, redondeo del adelanto en céntimos.

- **Nota de cierre**:
  - `lib/domain/pricing.ts#quoteStay` puro, sin I/O: DTOs y resultado discriminado con errores tipados,
    validación zod, desglose por noche/cargo, total, adelanto y saldo. Fechas civiles `[entrada, salida)`
    de Lima representadas en UTC para aritmética, sin depender de la zona del equipo ni del día actual.
  - Temporada ganadora por prioridad; si falta su tarifa devuelve error sin sustituir por una inferior.
    Viernes/sábado usan el precio de fin de semana; null hereda el normal y cero es válido. Mínimo de
    noches según llegada; huéspedes extra por noche y cargos por estancia/noche/huésped (una vez por estancia).
  - Aritmética monetaria con BigInt y límites de enteros seguros; redondeo del adelanto al céntimo, mitad
    hacia arriba. `depositPercent` requerido en cada llamada, sin valor comercial fijado para Saywa ni
    persistencia nueva. Límite técnico explícito de 366 noches por llamada. Decisiones en ADR 0006.
  - 65 tests nuevos de precios, 178 totales; lint, typecheck y build en verde. Cobertura V8 del motor:
    94/94 sentencias, 71/71 ramas, 6/6 funciones y 75/75 líneas (100 %). CI ejecuta la suite con cobertura
    y exige 90 % en esas métricas. Dependencia de desarrollo `@vitest/coverage-v8` alineada con Vitest 5.0.3,
    justificada por el criterio de cobertura; informes excluidos de ESLint/Git.
  - `reviewer` aprobado, sin hallazgos.
  - Sin UI, migraciones, cambios de BD ni `.env.local`. La futura acción/route cargará precios y política
    de adelanto del servidor y recalculará; el motor no autoriza ni verifica disponibilidad.
    Publicación y despliegue pendientes; siguiente pantalla y simulador en SD-207.

### [x] SD-207 · feat(dashboard): rates and seasons management
`M` · Depende: SD-205, SD-206 · Review: `R`
- **Alcance**: UI de temporadas y tarifas por unidad; simulador de cotización en vivo usando `quoteStay`.
- **Criterios**
  - [x] El simulador coincide con el cálculo del servidor para las mismas entradas.
- **Nota de cierre**:
  - Dashboard `/app/rates`: listado, alta, edición y borrado confirmado de temporadas, tarifas por unidad
    y cargos. Moneda de la propiedad visible; precio base, viernes/sábado opcional, extra por huésped
    y mínimo de noches. Explica prioridades, fin de temporada excluido y borrado en cascada de sus tarifas.
  - Conversión decimal exacta a céntimos con zod y límites de enteros de Postgres. Errores seguros para
    duplicados y temporadas solapadas de igual prioridad; identidad de unidad inmutable al editar.
  - DAL con sesión, membresía y filtros por org/propiedad en cada operación; relaciones verificadas antes
    de escribir y respaldadas por las FKs existentes. Sin service-role, cambios de esquema ni BD remota.
  - Simulador en vivo: cada acción recarga capacidad, moneda, temporadas, tarifas y cargos guardados y
    llama a `quoteStay` en el servidor. Solo acepta unidad, fechas, huéspedes y porcentaje de prueba;
    no acepta importes de cotización del cliente. El adelanto no persiste una política comercial.
    Desglose por noche/cargo, total, adelanto y saldo; oculta respuestas de escenarios anteriores.
    Se cancela el reset nativo del formulario para conservar los campos tras cada respuesta.
  - Verificación: lint, typecheck, 237 tests (59 nuevos) y build en verde. Motor y validadores al 100 %
    en las cuatro métricas, mínimo 90 % por archivo en CI y `test:pricing`. Build con red para Google Fonts.
  - HTTP local con sesión: CRUD real, fechas inválidas, solapes, duplicados, identidad inmutable,
    rechazo de unidad ajena, páginas de edición ajenas sin formulario, borrados ajenos sin efecto y
    mutaciones anónimas redirigidas al login. Total 53531, adelanto 26766 y saldo 26765 céntimos coinciden
    con una llamada independiente al motor; importes manipulados en el formulario son ignorados.
    Datos temporales eliminados; dashboard y ambos sitios públicos responden correctamente.
  - Chrome local: cálculo automático 27–30/07/2027, 13 huéspedes: USD 1300 (300 + 500 + 500), adelanto
    de prueba al 50 % y saldo de USD 650. Con 14 huéspedes muestra capacidad máxima y conserva el campo;
    al volver a 13 oculta el resultado anterior y recalcula. `reviewer` y `security-reviewer` aprobados.
  - Sin cambios en `.env.local`, migraciones ni producción. Push, PR y despliegue pendientes de confirmación;
    el marcado refleja implementación y verificación local. La sección pública de tarifas sigue usando
    `rate_tiers` hasta SD-208; el simulador no comprueba disponibilidad ni crea reservas.

### [x] SD-208 · feat(site): data-driven rates section and theming
`M` · Depende: SD-207 · Review: `R`
- **Alcance**: sección Tarifas con "desde S/ X" derivado de datos numéricos; eliminar `rate_tiers`; componentes
  públicos movidos a `components/site`; textos de UI genéricos (sin copy de Saywa en `dictionaries/`).
  El tema por tenant (colores, tipografía) se hace en SD-209.
- **Criterios**
  - [x] El tenant `demo` muestra sus propios textos y tarifas.
  - [x] Ningún texto específico de Saywa queda en código.
- **Implementación (local, sin push)**: `lib/domain/public-rates.ts` calcula las tarjetas (tarifa general +
  temporadas vigentes) como el mínimo por noche entre unidades activas; `lib/dal/public/rates.ts` lee con la clave
  anon bajo RLS, por petición y por propiedad (sin caché compartida entre tenants). La moneda sale de
  `properties.currency` (`S/` o `US$`). Sin tarifa para una temporada no se muestra tarjeta; sin ninguna tarifa
  se oculta la sección (el CTA de disponibilidad y el calendario SD-308 se conservan). La barra móvil muestra
  «desde X». El diccionario ya era genérico desde SD-209 parte 1.
- **Limpieza futura (requiere autorización explícita del dueño)**: la tabla `rate_tiers` sigue existiendo y el
  seed la rellena, pero nada la lee. Eliminarla exige una migración destructiva (borra datos publicados);
  no se hizo. Al autorizarla: `drop table rate_tiers` en una migración, quitar sus filas del seed,
  políticas/tests pgTAP (`0001_rls_enabled`, `0003_org_isolation`) y regenerar `lib/database.types.ts`.
- **Evidencia de aceptación (HTTP)**: `scripts/test-public-rates-http.mjs`, solo lectura, contra Supabase LOCAL
  sembrado (puerto 3208, hosts `saywa-lodges.localhost` y `demo.localhost`, es/en). Comprueba titular y lema de
  cada tenant, moneda (`US$` Saywa, `S/` demo), tarjeta base (`US$ 220` / `S/ 100`), temporadas del seed
  (`US$ 300`, 16 feriados a `US$ 500`; `S/ 150`) y que ningún precio, moneda o temporada cruce de un tenant a otro.
  Integrado en el job `db` de CI (build con el entorno del stack local). **Pendiente hasta que CI lo ejecute en
  verde**: en la sesión de desarrollo Docker no respondía, así que no se corrió contra una BD local y no se
  afirma resultado HTTP; solo hay `node --check`, lint, typecheck, test y build.

### [ ] SD-209 · feat(site): customizable public site template
`L` · Depende: SD-201, SD-208 · Review: `R+S`
- **Objetivo**: que el sitio de cada alojamiento se vea profesional, con la marca de cada dueño, y convierta
  visitas en consultas y reservas.
- **Alcance**: rediseño de la plantilla pública (`components/site`): hero con CTA de reserva y WhatsApp, galería,
  espacios, amenities, tarifas, ubicación, reseñas, FAQ y contacto; mobile-first. Tema por tenant en
  `properties.theme` (jsonb validado con zod): color primario, acento, fondo, 3–4 pares tipográficos predefinidos y
  radio de bordes; 4–6 paletas predefinidas más color personalizado. Editor en el dashboard (Sitio → Apariencia)
  con vista previa en vivo y advertencia si el contraste no cumple AA. Los valores se inyectan como CSS variables
  en el layout del sitio; no se acepta CSS arbitrario del usuario.
- **Criterios**
  - [ ] `saywa-lodges` y `demo` se ven con marcas distintas solo cambiando el tema, sin código.
  - [ ] Un color con contraste insuficiente muestra advertencia y el CTA sigue siendo legible.
  - [ ] El tema solo acepta valores validados (hex, presets); intentar inyectar CSS falla (test).
  - [ ] Lighthouse móvil ≥ 90 en rendimiento y accesibilidad.
- **Parte 1 (hecha, adelantada a pedido)**: plantilla nueva en `components/site/*` (hero editorial con barra de
  datos, intro + amenities, galería bento con visor `<dialog>`, espacios en tarjetas, tarifas + CTA de
  disponibilidad, ubicación, FAQ `<details>`, contacto, footer y barra CTA fija en móvil). Migración
  `properties.theme`/`properties.content` (jsonb, sin grant de escritura todavía). Lógica en
  `lib/domain/site-theme.ts` (5 presets, contraste WCAG, `themeToCssVars`) y `lib/domain/site-content.ts`.
  `dictionaries/` quedó solo con etiquetas genéricas. Fotos locales con `npm run db:seed-storage`.
  Cubre los criterios 1 y 3 y la parte de "CTA legible" del 2 (`foregroundFor`). El aviso de contraste en el
  editor, las reseñas y Lighthouse quedan para SD-210.
- **Parte 2 (local, sin push; SD-209 sigue abierto)**: `deriveTints`/`mixHex` en `lib/domain/site-theme.ts`
  calculan `--site-muted/surface/line` en el servidor (antes `color-mix` en CSS, sin validar): el texto atenuado
  cae a `fg` completo si no llega a AA sobre fondo y superficie, y la superficie cae al fondo si aun así no
  alcanza (caso real hallado por test en grises medios). Enlace «saltar al contenido» (`skipToContent`,
  es/en) y `<main id="main">`. Tests Vitest: hex personalizado (válidos/inválidos), lista cerrada de
  variables CSS ante intentos de inyección (incl. `__proto__`), contraste AA de botones, texto y tintes sobre
  una malla de fondos, y marcas distintas `andino` (Saywa) / `costa` (demo) solo por tema. Smoke HTTP por
  tenant `scripts/test-site-theme-http.mjs` (variables del tema, `theme-color`, skip link, barra CTA móvil,
  sin colores del otro tenant), añadido al job `db` de CI.
  - **Reseñas: no implementadas.** No existe tabla ni fuente de datos de reseñas verificables; no se inventan
    testimonios. Requiere un ticket propio (modelo de datos + moderación).
  - **Editor/aviso de contraste**: sigue siendo SD-210 (no duplicado).
  - **Lighthouse móvil ≥ 90: PENDIENTE.** El sitio público necesita la BD local sembrada y Docker no respondía
    (`Cannot connect to the Docker daemon`); sin BD la ruta responde 404, así que no se midió nada ni se afirma
    puntaje. Medir en preview o con el stack local levantado.
  - **Verificado**: `npm run lint`, `typecheck`, `test` (48 archivos, 743 tests) y `build` en verde. El smoke
    HTTP solo pasó `node --check`; su ejecución real queda a cargo de CI.

### [ ] SD-210 · feat(dashboard): site appearance editor
`M` · Depende: SD-106, SD-201, SD-209 (parte 1) · Review: `R+S`
- **Alcance**: "Sitio → Apariencia" en el dashboard: elegir preset, colores, par tipográfico y radio, con vista
  previa en vivo y aviso de contraste (`contrastWarnings`); editar `properties.content` (textos y FAQ por idioma).
  Server action + zod con los mismos schemas de `lib/domain`; ampliar el grant de `update` de `authenticated`
  a `theme`/`content`. Sección de reseñas cuando haya fuente de datos.
- **Criterios**
  - [ ] Un color con contraste insuficiente muestra advertencia antes de guardar.
  - [ ] Un miembro de otra org no puede editar el tema (test pgTAP).
  - [ ] Lighthouse móvil ≥ 90 en rendimiento y accesibilidad (medido en un deploy de preview).

---

## Fase 3 — Calendario e iCal (M3)

### [x] SD-301 · feat(db): calendar blocks with overlap exclusion
`M` · Depende: SD-204 · Review: `R+S`
- **Alcance**: `btree_gist`; `calendar_blocks (unit_id, period daterange, source booking|ical|manual, booking_id,
  feed_id, external_uid, expires_at)` con `EXCLUDE USING gist (unit_id WITH =, period WITH &&)`; RPCs para bloqueos
  manuales. ADR 0003.
- **Criterios**
  - [x] pgTAP: dos bloques solapados en la misma unidad fallan; check-out = check-in de otro no es solape.
  - [x] pgTAP: dos transacciones concurrentes por las mismas fechas → solo una gana.
- **Avance**: migración `20261028132649_calendar_blocks.sql`.
  - Tabla con `org_id`, `property_id` y `unit_id` coherentes por FK compuestas a `units` (`(unit_id, org_id)` y
    `(unit_id, property_id)`); `period` solo `[)` acotado y no vacío; `check` de coherencia por origen (`booking` exige
    `booking_id`; `ical` exige `feed_id` + `external_uid`; `manual` ninguno; solo `booking` puede tener `expires_at`);
    `note` ≤ 500 (nota de los bloqueos manuales, que pide SD-303). Índice único parcial `(feed_id, external_uid)` para el
    upsert de SD-305. `booking_id` y `feed_id` son `uuid` sin FK: `bookings` (SD-401) e `ical_feeds` (SD-304) no existen
    aún; esos tickets añaden la FK.
  - Acceso: los miembros solo **leen** (RLS `is_member`); `anon` no accede (la disponibilidad pública la resolverá otro
    ticket sin exponer notas). No hay grants de escritura: los bloqueos manuales se crean y borran con
    `create_manual_calendar_block` / `delete_manual_calendar_block` (rechazan fechas infinitas, también el `check` de la tabla; el tope de noches queda a decidir en SD-303; `security definer`, `search_path = ''`, exigen
    membresía y que la unidad/bloque pertenezca a la org indicada; `anon` sin `execute`). El borrado solo alcanza bloques
    `manual`. Los solapes **no** se pre-validan: el constraint lanza `23P01` y la capa que llame lo traduce (SD-303). Los
    demás errores: `42501` (sin permiso / no existe en esa org), `22023` (fechas o nota inválidas).
  - Sin seed: no hay dato local que lo justifique y los tests crean los suyos. Un hold vencido sigue ocupando fechas
    hasta que lo libere el cron / `create_booking_from_quote` (SD-401), como dice el ADR 0003.
  - Tests: `0013_calendar_blocks.test.sql` (80 aserciones) y
    `supabase/tests-concurrency/0014_calendar_blocks_concurrency.test.sql` (21 aserciones).
    El segundo se ejecuta con `python3 scripts/test-calendar-concurrency.py`, paso obligatorio añadido al job `db`
    después de `supabase test db`. El controlador usa `supabase_admin` por socket Unix dentro del contenedor local;
    los dos workers cambian a `authenticated` y usan el JWT del fixture para llamar a los RPCs.
    No requiere contraseñas, TCP, grants adicionales ni dependencias Python externas.
  - Concurrencia: A retiene fechas sin commit; B intenta solaparlas y `pg_blocking_pids` confirma que espera
    **específicamente a A**. Commit de A → B falla con `23P01`; rollback de A → B gana; adyacencia → ambos ganan.
    También cubre una carrera sin ganador prefijado y un cambio privilegiado concurrente de `manual` a `booking`:
    el borrado bloquea la fila con `FOR UPDATE` antes de validar su origen y rechaza borrar la reserva.
    Hay timeouts de consulta, transacción inactiva y proceso; el runner valida el plan TAP completo y limpia
    fixtures/extensiones incluso ante errores SQL. Solo termina sesiones etiquetadas con el ID de su ejecución.
    Ejecutar secuencialmente sobre la BD local; no ejercita el pooler. Un corte forzoso del runner/servidor puede
    requerir `supabase db reset`; nunca ejecutar estas pruebas contra una BD remota.
  - Evidencia independiente (2026-10-28): `db reset` OK; `test db` **13 archivos / 424 aserciones**;
    concurrencia **5 ejecuciones consecutivas × 21 aserciones**, todas OK. Mutaciones locales: retirar `FOR UPDATE`
    hace fallar 3 aserciones; retirar la exclusión hace fallar 7; ambas protecciones restauradas.
    Error SQL inyectado después de commits: limpieza deja cero fixtures, extensiones de prueba y sesiones propias.
    Tipos regenerados y equivalencia comprobada con TypeScript. `npm ci`, `lint`, `typecheck`,
    `test -- --coverage` (**411 tests**) y `build` OK con **Node 24.22.1** en copia sin `.env*` y placeholders de CI.
  - **Cierre técnico y revisión R+S completados**: Codex realizó la revisión independiente de la implementación
    de Claude Code, documentada en [docs/reviews/SD-301.md](reviews/SD-301.md), sin hallazgos críticos o importantes
    abiertos. El usuario confirmó que esta revisión cubre R+S y no requiere subagentes anidados; el fallo al
    iniciarlos no bloquea el ticket. Listo para commit y PR con las verificaciones locales registradas.
    No se ejecutó GitHub Actions ni se hizo commit/push/PR/merge. El CI remoto verde se exige para el último
    commit del PR antes del merge; no es requisito previo para abrirlo.
  - Antes de habilitar booking/iCal: SD-304/401 deben añadir FKs **compuestas** que aten feed/booking a su unidad
    y org (una FK por ID solamente no basta); SD-401 debe restringir el borrado de unidades, que hoy cascadea a sus
    bloques. SD-305 debe repetir `where feed_id is not null` en `ON CONFLICT` (índice parcial).


### [x] SD-302 · feat(domain): availability helpers
`S` · Depende: — · Review: `R`
- **Alcance**: `lib/domain/availability.ts` y `dates.ts`: noches entre fechas, rangos `[)`, días bloqueados de un mes,
  "hoy" en `America/Lima`.
- **Criterios**
  - [x] Tests con cambio de mes/año y reloj fijado.
  - [x] Fechas estrictas: `2027-02-29`, `2027-13-01`, `2027-1-1`, `0000-01-01` y timestamps (`…T00:00:00Z`) se
    rechazan con error tipado; nada se normaliza ni se trunca.
  - [x] Rango `[start, end)`: cero noches (`EMPTY_RANGE`) e invertido (`INVERTED_RANGE`) son inválidos, igual que
    el `check` de `calendar_blocks`; check-out = check-in de otro no es solape (sí adyacencia).
  - [x] `blockedDatesInMonth`: recorta al mes, ordena y deduplica rangos solapados/duplicados/adyacentes; el día de
    check-out no cuenta como ocupado; un rango inválido lanza en vez de omitirse.
  - [x] "Hoy" en Lima independiente de la TZ del equipo (tests con `TZ` = UTC, Lima, Auckland, Tokio, Nueva York,
    Kiritimati) y del reloj real (`vi.setSystemTime` alrededor de medianoche UTC/Lima).
- **Avance**
  - `dates.ts`: aritmética sobre conteo de días del calendario gregoriano proléptico (sin `Date`, sin offset del
    host; evita el remapeo de años 0–99 de `Date.UTC`). Errores con `DateError.code`
    (`INVALID_FORMAT | INVALID_DATE | INVALID_MONTH | INVALID_INTEGER | OUT_OF_RANGE | INVALID_CLOCK`). Variante sin
    excepción para input no confiable: `parseIsoDate`. Rango soportado 0001-01-01..9999-12-31.
    `todayInLima(now = new Date())` usa `Intl.DateTimeFormat` con `timeZone: "America/Lima"`, calendario y números
    fijos y era explícita; el instante se puede inyectar y, si se omite, lee el reloj una vez.
    `monthBounds("9999-12")` devuelve `endExclusive: null` porque el siguiente día está fuera del dominio;
    clipping y días bloqueados funcionan también en ese mes. Los extremos de los rangos siguen siendo fechas
    válidas: no se representa una noche ocupada el 9999-12-31 con un checkout en el año 10000.
  - `availability.ts`: `dateRange`/`parseDateRange`, `nightsBetween`, `rangeContains`, `rangesOverlap`,
    `rangesAdjacent`, `clipRangeToMonth`, `blockedDatesInMonth` (devuelve fechas ISO). No reimplementa la doble
    reserva: eso sigue siendo del exclusion constraint.
  - Fuera de alcance, sin tocar: pricing, finanzas, reportes/exportación y sus validadores conservan sus helpers
    propios (`parseDate`, `nightsBetween`, `addDays`, meses y `todayInLima` con offset fijo -5). Propuesta de ticket: migrarlos a `dates.ts`
    y eliminar la duplicación. Sin UI, DAL ni SD-303; sin dependencias nuevas (no se usó `date-fns`).
  - Revisión independiente de Codex (2026-10-28), correcciones y evidencia: [SD-302](reviews/SD-302.md).
    `lint`, `typecheck`, `build` con placeholders y suite completa OK: **28 archivos / 518 tests** en cada una
    de seis TZ. `test:pricing`: **7 archivos / 299 tests**, umbrales originales ≥90 % por archivo intactos.
    `dates.ts`: 100 % en las cuatro métricas; `availability.ts`: 97.61 % sentencias, 95.83 % ramas,
    100 % funciones, 97.14 % líneas (queda el relanzamiento defensivo de errores ajenos al dominio).
    Referencia UTC independiente: **3.652.059 fechas** verificadas en todo 0001–9999.
  - Listo para continuar el flujo del ticket; sin commit, push, PR ni merge por instrucción del dueño.


### [x] SD-303 · feat(dashboard): unit calendar
`L` · Depende: SD-301, SD-302 · Review: `R`
- **Alcance**: vista mensual por unidad (y vista compacta de todas), color por origen (directa, Airbnb, Booking,
  manual); crear/eliminar bloqueos manuales con nota.
- **Criterios**
  - [x] Intentar bloquear fechas ocupadas muestra un error claro (del constraint, no de validación previa).
  - [x] Usable en móvil.
- **Evidencia local (2026-10-29, sin commit/PR/deploy)**:
  - Calendario autenticado en `/app/calendar`: navegación mensual, selector de unidad, grilla mensual lunes–domingo,
    resumen compacto de todas las unidades (incluidas inactivas), lista de bloques y estados vacíos/error.
    DAL con `requireActiveOrg`, cliente de sesión y filtros `org_id`/`property_id`; rangos intersectados por mes,
    paginación explícita de 1000 filas y DTO sin identificadores de reservas/feeds ni notas de fuentes no manuales.
  - Actions con zod y RPCs de SD-301. Rangos `[inicio, salida)`, nota opcional ≤500 caracteres y hasta 366 noches
    por bloqueo; confirmación al crear y eliminar. Sin consultar solapes antes de escribir: sólo `23P01` se
    traduce a «Estas fechas ya están ocupadas. Elige otro rango.»; otros errores se registran en servidor y
    reciben respuesta segura. No se agregaron dependencias ni migraciones.
  - Colores + letras + nombres accesibles para las fuentes. SD-301 sólo guarda `booking|ical|manual` y no hay
    metadatos de canal: `booking` se presenta como Directa y `ical` como «canal sin identificar»; Airbnb/Booking
    tienen leyenda diferenciada, sin deducir canales de notas/UUIDs ni crear reservas/feeds ficticios.
  - `npm ci`, lint, typecheck, 550 tests Vitest (32 nuevos de dominio/DAL/actions), build; Supabase local:
    `db reset` y `test db` verdes (13 archivos, 424 aserciones, incluidas las 80 de SD-301).
  - `node scripts/test-calendar-http.mjs`: nueve grupos de comprobaciones HTTP contra build local y sesión
    del seed; creación/borrado persistidos, constraint de solape, adyacencia aceptada, notas escapadas,
    unidad ajena y acceso anónimo rechazados, validación y borrado repetido seguros. Limpia sus propios fixtures.
  - Chrome local: vista compacta y mensual en emulación iPhone SE (375 px), etiquetas accesibles por fecha;
    creación con nota/confirmación, mensaje de solape y eliminación confirmada comprobados desde UI.
    Se corrigió selector obsoleto al navegar a una unidad (formulario con key por mes/unidad).
  - Revisiones independientes de corrección y seguridad sin hallazgos pendientes: [SD-303](reviews/SD-303.md).
    No se accedió a producción/remoto ni `.env.local`; fuera de alcance SD-304/305/401.

### [x] SD-304 · feat(ical): per-channel calendar export
`M` · Depende: SD-301 · Review: `R+S`
- **Alcance**: `ical_feeds` (unit, channel, `import_url`, `export_token`); route `/api/ical/[token]` que genera `.ics`
  con todos los bloques excepto los importados del mismo canal; tokens aleatorios, regenerables.
- **Criterios**
  - [~] El `.ics` cumple RFC 5545 (CRLF, plegado a 75 octetos, UID/DTSTAMP/DTSTART/DTEND por fecha, tests); falta importarlo en Google Calendar a mano.
  - [x] Token inválido → 404; el `.ics` no contiene datos personales del huésped.
- **Avance**: migración `ical_feeds` (una fila por casa y canal; `export_token` de 244 bits aleatorios, único; `import_url` solo https, que usará SD-305) con
  RLS **solo del dueño** (el token es un secreto), grants por columna (el token solo cambia con `regenerate_ical_token`), y la FK compuesta
  `calendar_blocks (feed_id, unit_id) → ical_feeds (id, unit_id)` que SD-301 dejó pendiente (un bloque nunca apunta a un feed de otra casa u org) (borrar un feed borra lo que importó; `0013_calendar_blocks.test.sql` ahora crea feeds reales).
  `get_ical_export(token)` (SECURITY DEFINER, `search_path` vacío, ejecutable por `anon`) devuelve `null` para un token desconocido o mal formado y, si no, solo
  id y fechas de los bloques de la casa (que terminan hace menos de 30 días) **menos los importados del mismo canal** (incluye reservas directas, holds sin liberar, bloqueos manuales y otros canales).
  Ruta `GET /api/ical/[token]` (`text/calendar`, `no-store`, 404 vacío igual para token inválido o regenerado, eventos "Reservado" sin datos personales)
  y pantalla del dueño `/app/calendar/feeds` (crear enlace por casa y canal, copiar, regenerar, eliminar). Generador puro `lib/ical/export.ts` (cobertura ≥ 90 % exigida).
  Sin límite de peticiones todavía: lo cubre SD-409. La URL se muestra con el host del panel (un host de plataforma, donde `/api/*` se sirve tal cual).

### [x] SD-305 · feat(ical): feed import and sync engine
`L` · Depende: SD-304 · Review: `R+S`
- **Alcance**: `lib/ical/import.ts`: HTTPS con allowlist exacta Airbnb/Booking/Vrbo, DNS/IP pública
  fijada a la conexión TLS, redirecciones revalidadas (máximo tres), deadline total de 10 s y cuerpo de 1 MiB;
  parseo con `node-ical`; sincronización transaccional por `(feed_id, external_uid)`, eliminación de eventos
  desaparecidos y `sync_conflicts`; gestión de URL, último sync/error y «Sincronizar ahora» solo del dueño.
- **Criterios**
  - [x] Fixtures de exportaciones reales públicas de Airbnb y Booking, anonimizadas; procedencia en
    `lib/ical/fixtures/README.md`. Sin cuentas OTA ni llamadas a calendarios privados.
  - [x] URL privada/localhost/host fuera de allowlist, DNS privado/mixto y redirección insegura rechazados.
  - [x] Conflicto con reserva directa registrado y visible en dashboard (pgTAP y smoke HTTP con sesión local real).
- **Implementación y evidencia local (2026-10-29)**:
  - Migración `20261029120000_ical_sync.sql`: conflictos con FK compuesta feed/org y RLS del dueño,
    RPCs de sesión sin service-role en acciones, permisos por columna y lease de 2 minutos con bloqueo
    de fila. Un segundo sync espera al primero y no obtiene lease mientras está activo; cambiar URL
    invalida completaciones anteriores. Fallar descarga/parseo conserva bloques y conflictos previos.
  - Snapshots completos de hasta 2000 eventos; fechas estrictas `[)` y UID SHA-256 (sin nombres, teléfonos,
    descripciones ni URL del huésped en BD/logs). Recurrencias, timestamps, UID duplicados y calendarios
    truncados se rechazan completos. Calendario válido vacío elimina solo eventos de ese feed.
    Se retiran rangos obsoletos antes de aplicar cambios para permitir movimientos/intercambios de fechas;
    el exclusion constraint sigue siendo la autoridad ante reservas, manuales y otros feeds.
  - Dependencia de producción `node-ical@0.27.3` fijada (Node >=22, compatible con el proyecto >=24),
    necesaria para interpretar ICS de los canales; no se usa su fetch. Tipos regenerados con CLI local,
    conservando el formato previo fuera de las adiciones.
  - pgTAP: 16 archivos / 539 aserciones (51 nuevas); pruebas de sesión/RLS, idempotencia, desapariciones,
    conflictos directos/manuales/otro feed, reintentos, intercambio de rangos, lease, URL cambiada y errores.
    Concurrencia real: `python3 scripts/test-calendar-concurrency.py` (21 aserciones) y
    `python3 scripts/test-ical-concurrency.py` (10): el sync espera a una reserva directa sin commit y,
    tras su commit, conserva únicamente la reserva y registra el conflicto. Ejecutar secuencialmente
    sobre Supabase local; ambos runners limpian sus fixtures incluso ante errores.
    Una ejecución de la carrera sin ganador prefijado de SD-301 produjo el abort seguro `40P01`
    de PostgreSQL: se corrigió ese test para admitirlo junto a `23P01`, conservando las aserciones
    de un solo ganador y una sola fila. Las carreras con ganador prefijado siguen exigiendo `23P01`.
  - Suite completa: 40 archivos / 665 tests; parser repetido con TZ UTC, Lima, Auckland y Apia. Se corrigió
    el desfase de VALUE=DATE en zonas positivas: se conservan las fechas civiles originales
    validadas, incluso en fechas que una TZ del host omite. Importador: cobertura 94.65 % sentencias /
    91.42 % ramas / 100 % funciones / 97.67 % líneas. `test:pricing`:
    321 tests y cobertura 99.74 % sentencias / 98.12 % ramas / 100 % funciones / 99.84 % líneas;
    umbrales originales intactos. `npm ci`, lint, typecheck, build y `supabase db reset` locales OK.
  - Cierre HTTP: `node scripts/test-ical-http.mjs` OK con build y sesiones Supabase locales reales de dueño,
    staff y dueño de otra org. Comprueba dashboard, configuración, sync repetido con IDs estables, conflicto
    directo visible, desaparición de eventos/conflictos, eliminación del feed por acción HTTP, preservación
    de otro feed/reserva directa, errores seguros e aislamiento RLS/acciones entre orgs y frente a anónimo.
    HTTPS OTA se sustituye por fixtures solo en el proceso de prueba; no prueba conectividad con cuentas OTA
    ni interacción visual en navegador. El 404 era `ROOT_DOMAIN=saywa.test` con requests a `localhost:3000`:
    se corrigió el host del runner, sin cambiar proxy/auth. El runner usa `ROOT_DOMAIN`, la variable que
    valida `lib/env.ts`; `PLATFORM_HOSTS` no existe. El smoke exige redirect de anónimo en el host de
    plataforma y 404 en host de tenant mediante HTTP crudo (Node fetch puede sustituir el header Host).
    También se corrigió el fixture de 302 para asignar status/Location antes del callback.
    El cambio de CI es mínimo: añade solo `python3 scripts/test-ical-concurrency.py` al job de BD,
    reutilizando el Supabase local ya iniciado, sin dependencias ni credenciales nuevas.
  - Gates reejecutados en esta continuación: `npm run lint`, `npm run typecheck`,
    `npm run test -- --coverage` OK (40 archivos / 665 tests;
    cobertura del scope configurado 99.74 % sentencias / 98.12 % ramas / 100 % funciones / 99.84 % líneas).
    `npm run build` con variables Supabase locales y `ROOT_DOMAIN=localhost:3000`,
    `npx supabase db reset --local`, `npx supabase test db` (16 archivos / 539 aserciones), ambos runners
    de concurrencia (21 + 10 aserciones) y `node scripts/test-ical-http.mjs`: todos OK.
    Tipos regenerados con `npx supabase gen types typescript --local` y comparados mediante
    asignabilidad TypeScript bidireccional: coinciden, conservando el formato del archivo existente.
    Revisión focalizada del diff completo
    por agente principal, reviewer y security-reviewer: sin hallazgos importantes pendientes en SSRF/DNS,
    redirecciones, RLS/multi-tenant, concurrencia e idempotencia.
    `git diff --check` y `git diff --cached --check` OK; `.gitattributes` conserva CRLF de los fixtures
    RFC 5545 y reconoce CR como final de línea solo en esos archivos.
    Sin producción, Supabase remoto, `.env.local`, push ni PR.
  - Producción: aplicar la migración antes de desplegar este código (tarea del dueño). Sin cron ni alertas:
    corresponden a SD-307. La allowlist es explícita; hosts regionales no enumerados se rechazan.

### [ ] SD-306 · chore(email): transactional email infrastructure
`S` · Depende: SD-103 · Review: `R+S`
- **Alcance**: Resend (dominio verificado), `lib/email/` con plantillas React Email es/en, envío desde servidor,
  sin PII en logs.
- **Criterios**
  - [ ] Email de prueba enviado en entorno de preview. **PENDIENTE (bloqueado por el dueño)**: requiere dominio
        verificado en Resend y una API key, que el agente no tiene ni debe usar. Sin evidencia de envío real todavía.
- **Estado (implementado en rama `feat/SD-306-email-infrastructure`, sin push ni PR)**:
  - `lib/email/`: `config.ts` (config perezosa y fail-closed; no está en `lib/env.ts` para no romper build/previews sin key),
    `content.ts` (plantillas = función pura `(lang, props) → contenido`, props validadas con zod, texto saneado),
    `messages.ts` (copy es/en), `layout.tsx` (HTML con tablas e estilos inline; React escapa todo), `render.tsx`
    (HTML + texto plano), `send.ts` (`sendEmail`, nunca lanza; devuelve `{ok,id,simulated}` o `{ok:false,reason}`).
  - **Sin dependencias nuevas**: Resend se llama por `fetch` a su API REST (con `Idempotency-Key`), y las plantillas son
    componentes React renderizados con `react-dom/server.edge` (ya incluido con React; `react-dom/server` lo bloquea Next
    en el grafo del servidor). **Desviación del alcance**: no se usa `@react-email/components` porque no se pudo
    instalar en esta sesión; migrar es cambiar `layout.tsx` por sus componentes sin tocar `content.ts`/`send.ts`.
  - Seguridad: sin key fuera de producción → **simulación** (renderiza y registra, no entrega); en producción sin key, con
    `EMAIL_MODE=simulate` o remitente inválido → `not_configured`. Fuera de producción solo se entrega a
    `EMAIL_ALLOWED_RECIPIENTS` (lista vacía = nadie). Remitente validado (sin CR/LF). Logs con campos cerrados: nunca
    destinatario, asunto, cuerpo, props, key ni texto de error del proveedor.
  - Reintentos: 3 intentos con backoff 300/600 ms ante red, timeout (10 s), 429, 5xx y 409 `concurrent_idempotent_requests`;
    misma `Idempotency-Key` en todos los intentos; un 2xx nunca se reintenta; 4xx → `rejected`.
  - `POST /api/email/test` (humo para el dueño): 404 salvo fuera de producción y con `EMAIL_TEST_SECRET` (≥ 16 car.);
    Bearer comparado en tiempo constante; destinatario sujeto a la allow-list.
  - Tests (Vitest, deterministas, sin red): config, idiomas es/en, escapado, control chars, PII en logs, reintentos,
    idempotencia, ruta de prueba.
  - **Pasos del dueño para cerrar el criterio** (el agente no los hace):
    1. En Resend: verificar un dominio/subdominio (SPF + DKIM en el DNS) y crear una API key de envío.
    2. En Vercel → entorno **Preview** (no Production): `RESEND_API_KEY`, `EMAIL_FROM` (en el dominio verificado),
       `EMAIL_ALLOWED_RECIPIENTS` (tu correo), `EMAIL_TEST_SECRET` (aleatorio, ≥ 16 car.). `ROOT_DOMAIN` del preview debe
       coincidir con el host usado, porque `proxy.ts` solo sirve `/api/*` en hosts de plataforma.
    3. Tras el deploy del preview: `curl -X POST https://<host-preview>/api/email/test -H "Authorization: Bearer $EMAIL_TEST_SECRET" -H "Content-Type: application/json" -d '{"to":"<tu correo>","lang":"es"}'`
       → `{"ok":true,"simulated":false,"id":"..."}` y llega el correo (revisar también `lang:"en"`).
    4. Registrar aquí la evidencia (id del mensaje, fecha) y marcar el criterio. Antes de producción: configurar las mismas
       variables en Production **sin** `EMAIL_ALLOWED_RECIPIENTS`/`EMAIL_TEST_SECRET`.
  - Fuera de alcance / propuesta: límite de peticiones a la ruta de prueba (SD-409); plantillas de reservas (SD-407).

### [ ] SD-307 · feat(ical): scheduled sync and conflict alerts
`M` · Depende: SD-305, SD-306 · Review: `R+S`
- **Alcance**: endpoint `/api/cron/ical-sync` protegido con `CRON_SECRET`; cada 15 min (Vercel Cron Pro o `pg_cron`);
  procesa feeds en lotes; email al owner ante conflicto nuevo o feed caído > 24 h.
- **Criterios**
  - [ ] Sin el secreto → 401.
  - [ ] Un feed que falla no detiene los demás.

### [x] SD-308 · feat(site): public availability calendar
`M` · Depende: SD-303 · Review: `R`
- **Alcance**: reemplazar el iframe de Airbnb por calendario propio de disponibilidad (solo ocupado/libre).
- **Criterios**
  - [x] No expone origen ni datos de las reservas.
- **Avance** (implementado y verificado localmente; sin review independiente, sin push ni PR)
  - La página pública no tenía iframe de Airbnb: no se inventó ni se quitó nada. Se añadió la sección
    `components/site/availability.tsx` (id `#availability-calendar`, enlace en la navegación) entre Tarifas y Ubicación;
    el CTA `#availability` de Tarifas queda intacto.
  - BD: `20261029140000_public_availability.sql` crea `get_public_unit_availability(property, unit, from, to)`
    (`stable`, `security definer`, `search_path = ''`, `execute` solo para anon/authenticated/service_role). Devuelve
    únicamente `start_date`/`end_date` `[)` de una unidad activa de una propiedad publicada que pertenezca a esa
    propiedad; ventana ≤ 62 días (`22023`); recorta a `[hoy Lima, hoy+731)`; unidad/propiedad desconocida, inactiva,
    no publicada o cruzada entre tenants → `42501` genérico (nunca "todo libre"). `calendar_blocks` sigue sin SELECT para anon.
    Un hold vencido sigue ocupando hasta que se libere (ADR 0003). Reversible con `drop function`.
  - Dominio `lib/domain/public-availability.ts` (mes navegable: mes actual en Lima hasta +22 meses, cuadrícula lunes-primero,
    estados free/occupied/past); DAL `lib/dal/public/availability.ts` (server-only, zod, errores genéricos).
    La página lee `?unit=` y `?month=` como no confiables: la unidad debe ser una activa de la propiedad del host y el mes se acota.
    Navegación con enlaces (funciona sin JS); tabla semántica con `th scope`, texto para lectores de pantalla por celda,
    ocupado distinguido por trazo/rayado y no solo por color; es/en vía `dictionaries/`.
  - Evidencia local (2026-10-29, solo Supabase local): `lint`, `typecheck` OK; `npm run test` **42 archivos / 687 tests**;
    `test:pricing` **10 archivos / 337 tests**, `public-availability.ts` ≥ 90 % (umbral por archivo); el test de dominio
    pasa también con `TZ` = UTC, Auckland y Lima; `npm run build` OK; `supabase db reset` + `supabase test db`
    **17 archivos / 573 tests** (nuevo `0018_public_availability.test.sql`, 34 aserciones: privacidad, recorte, adyacencia,
    ventana, multi-tenant, no publicada/inactiva, grants); concurrencia de calendario (21) e iCal (10) OK.
  - HTTP real: `node scripts/test-public-availability-http.mjs` (tras `npm run build` con env local; puerto 3308, limpia lo que crea):
    10 comprobaciones OK — noches `[)` con adyacencia manual+ical+hold y check-out libre, es/en, aislamiento
    `saywa-lodges.localhost` vs `demo.localhost`, `?unit=` ajeno ignorado, host desconocido 404, HTML/RSC sin nota/uid/feed/booking/source,
    límites de mes, marcado móvil/a11y, PostgREST anon (tabla denegada, RPC solo fechas, par cruzado `42501`),
    propiedad no publicada 404 y sin unidades activas sin calendario.
  - **No verificado**: render visual en móvil (el screenshot headless no llegó a la sección; solo se comprobó el marcado).
    Sin lector de pantalla real. El script HTTP aún no está en el CI.
  - **Gate manual para el dueño**: aplicar `20261029140000_public_availability.sql` en la BD remota antes del deploy
    (sin ella el calendario muestra el mensaje "no disponible" en producción, el resto del sitio no se afecta).

---

## Fase 4 — Cotizador, reservas y pago manual (M4 🎯)

### [~] SD-401 · feat(db): guests, quotes, bookings and payments
`L` · Depende: SD-205, SD-301 · Review: `R+S`
- **Alcance**: tablas `guests`, `quotes`, `bookings`, `payments`; RPC `create_booking_from_quote` (transacción:
  valida quote vigente, libera holds vencidos, upsert guest, crea booking `pending_payment` + bloque con
  `expires_at`); RPCs `confirm_payment`, `reject_payment`, `cancel_booking`, `expire_holds`; datos de pago por
  propiedad (Yape/Plin, cuentas bancarias).
- **Criterios**
  - [x] pgTAP: reservar fechas ocupadas falla; quote vencida falla; hold vencido libera fechas.
  - [x] Transiciones de estado inválidas rechazadas (p. ej. confirmar una cancelada).
- **Avance** (implementado localmente; sin commit remoto, push ni PR; **sin revisión R+S**, omitida por petición del usuario)
  - Migración `20261029185857_booking_schema.sql` (aditiva, rollback en su cabecera): `guests`, `quotes`, `bookings`,
    `payments`, `property_payment_accounts` y `properties.booking_hold_minutes` (15–4320, por defecto 120).
    FKs compuestas con `org_id` (unidad/propiedad, huésped, quote); `quote_id` único en `bookings` (una quote → una
    reserva); `payments` fija la moneda de la reserva por FK; un solo pago `pending_review` por reserva. Borrar una
    unidad, huésped o quote con reservas falla (`NO ACTION`): resuelve el borrado en cascada de bloques anotado en SD-301.
  - Permisos: `anon` sin ningún privilegio de tabla (PII de huéspedes, cuentas de cobro). Los miembros solo **leen**
    guests/quotes/bookings/payments; las cuentas de cobro son CRUD de miembros por RLS. Toda mutación es por RPC
    `security definer` (`search_path = ''`) o `service_role`. Triggers `guard_booking_update`/`guard_payment_update`
    fijan términos inmutables (importes, fechas, unidad…) y la máquina de estados incluso para escritores privilegiados:
    `pending_payment → confirmed|cancelled|expired`, `confirmed → cancelled`, `pending_review → approved|rejected`.
  - `create_booking_from_quote(token, nombre, email, teléfono)`: ejecutable por `anon` (el token de 32+ caracteres es la
    capacidad; devuelve solo ids/estado, sin PII). Bloquea la quote (`FOR UPDATE`), reproduce la reserva existente si la
    hay (idempotente), valida vigencia (`SD001`), unidad activa, aforo y moneda, libera holds vencidos de esa unidad, hace
    upsert del huésped (nunca sobrescribe nombre/teléfono existentes) y crea reserva + bloque; los importes salen
    **solo** de la quote guardada. Solape → `23P01` del constraint (la transacción entera revierte, incluido el huésped).
  - `confirm_payment`/`reject_payment`/`cancel_booking(org, id, …)`: miembros de la org; orden de bloqueo reserva → pago;
    repetir la misma operación devuelve `replayed: true`; transición inválida → `55000`; pago menor al adelanto no
    confirma (`22023`); cancelar libera el bloque y rechaza el voucher en revisión. `expire_holds()`: solo `service_role`.
    Una reserva con voucher `pending_review` **no** se expira (el huésped ya pagó); queda a decisión del dueño.
  - Tests: `0019_booking_schema.test.sql` (**109 aserciones**): catálogo/grants, fecha ocupada, quote vencida/desconocida/
    mal formada, datos inválidos, moneda y aforo, hold vencido que libera fechas, voucher que lo protege, `expire_holds`,
    máquina de estados (RPC y triggers), idempotencia, aislamiento org A/B y cross-org, `anon` sin lecturas.
  - Evidencia local (2026-10-29): `supabase db reset` OK; `supabase test db` **17 archivos / 648 aserciones**;
    `scripts/test-calendar-concurrency.py` 21/21; `lint`, `typecheck`, `test` (42 archivos / 687 tests, tras integrar origin/main con SD-308) y `build`
    (placeholders de CI, sin `.env*`) OK con Node 26.9.0 (CI usa 24). Tipos regenerados con `supabase gen types --local`
    y formateados con prettier. **Concurrencia real (manual, dos sesiones `psql` locales, no automatizada):** A retiene su
    transacción abierta con quote A; B (quote distinta, fechas solapadas) espera y falla con `23P01` al confirmar A; dos
    llamadas simultáneas con la misma quote producen una sola reserva (la segunda devuelve `replayed: true`).
  - **Pendiente / decisiones para el dueño**
    - No hay RPC para crear quotes ni payments (los tests los insertan como propietario de la tabla): son SD-402 y
      SD-405. Esos escritores deben bloquear primero la fila de la reserva (como las RPCs) para no competir con el barrido.
    - `calendar_blocks.booking_id` sigue **sin FK** a `bookings`: ~27 inserciones de `source = 'booking'` en tests de
      SD-301/303/304/305/803 usan UUID aleatorios. Añadir la FK exige reescribir esos fixtures; propuesto como ticket aparte.
    - La prueba de concurrencia real no está en CI (extender `scripts/test-calendar-concurrency.py`).
    - Reembolsos de pagos aprobados al cancelar y pagos parciales (suma < adelanto) quedan fuera de alcance.
    - Sin revisión `reviewer`/`security-reviewer` (pedido explícito): obligatoria antes del PR según `CLAUDE.md`.
    - Migración sin aplicar en remoto: aplicarla es del dueño antes de cualquier código que dependa de ella.

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

### [x] SD-408 · feat: hold expiration job and booking status page
`S` · Depende: SD-401 · Review: `R+S`
- **Alcance**: cron que ejecuta `expire_holds`; página `/[lang]/reserva/[public_token]` con estado y siguiente paso.
- **Criterios**
  - [x] Hold vencido pasa la reserva a `expired` y libera fechas.

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
- **Estado**: logs estructurados + `onRequestError` + cron/iCal hechos (`docs/observability.md`). Falta la alerta remota:
  requiere elegir y configurar un servicio externo (decisión del dueño); el ticket sigue abierto.

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

### [ ] SD-704 · feat(marketing): Saywa Direct landing
`M` · Depende: SD-105, SD-107 · Review: `R`
- **Objetivo**: atraer dueños de alojamientos (clientes del SaaS) y convertir visitas en conversaciones de venta.
- **Alcance**: landing comercial en el dominio raíz: hero con la propuesta de valor ("Convierte tus chats de
  WhatsApp en reservas pagadas"), problema y solución, cómo funciona en 3 pasos, funcionalidades (link de reserva,
  calendario sincronizado con Airbnb/Booking, pagos con Yape/transferencia/Mercado Pago, web con dominio propio),
  caso Saywa Lodges con números reales, planes y precios, FAQ, CTA a WhatsApp o agendar demo, enlace al sitio demo.
  Usa los mismos tokens de SD-107: cambiar la paleta en un solo lugar recolorea landing y dashboard. SEO
  (metadata, Open Graph, sitemap) y registro de clics en el CTA.
- **Criterios**
  - [ ] Cambiar la paleta en los tokens recolorea la landing sin tocar componentes.
  - [ ] Lighthouse móvil ≥ 90 en rendimiento, accesibilidad y SEO.
  - [ ] El CTA abre WhatsApp con mensaje prellenado y el clic queda registrado.

### [x] SD-705 · chore(deps): security update of dependencies
`S` · Depende: — · Review: `R+S` · **Prioridad: antes de la Fase 8**
- **Alcance**: `npm audit` (SD-206, 2026-10-23) reportó 9 paquetes con avisos, incluido Next.js 16.2.6 con
  severidad crítica. Evaluar exposición real, actualizar a versiones corregidas (leer las notas de migración en
  `node_modules/next/dist/docs/`), sin `npm audit fix --force` a ciegas.
- **Criterios**
  - [x] `npm audit` sin avisos altos/críticos o cada aviso restante justificado en el PR.
  - [x] Enrutamiento por host/idioma, login y dashboard verificados contra el servidor local tras actualizar.
- **Nota de cierre**:
  - Next y `eslint-config-next` 16.2.6 → 16.4.3, versiones exactas alineadas; lockfile con Sharp 0.35.5
    y libvips 1.3.4. Sin `audit fix --force`, nuevas dependencias directas ni cambios de esquema.
  - Auditoría del 2026-10-27: cero vulnerabilidades en todas las severidades. Se revisaron advisories
    oficiales: el DoS de Server Actions afecta la superficie anterior; se corrige al actualizar. Los
    parches de optimización de imágenes y Cache Components también quedan incluidos; no se afirma que
    se hayan reproducido exploits ni comprobado todas las precondiciones del sistema de producción.
  - Leídas las guías de la versión instalada. Se conserva proxy por host/idioma sin autorización,
    sesión/membresía en DAL y la restricción de imágenes al host de Storage. Se incluye el bloque
    de documentación de AGENTS regenerado automáticamente por Next 16.4.3.
  - Verificación con Node 24.22.1: lint, typecheck, 237 tests, cobertura del dominio de precios al 100 %
    y build correctos. `reviewer` y `security-reviewer` aprobados.
  - HTTP local en puerto 3001: login por server action con cookie y redirect, seis pantallas de dashboard,
    rechazo sin sesión, Saywa y demo en es/en, redirección por idioma, imagen optimizada y aislamiento de
    rutas de plataforma/internas. `/admin` y APIs legacy siguen devolviendo 404.
  - La carpeta original presentó lecturas `ECANCELED`/timeout y referencias remotas duplicadas inválidas;
    se verificó en una copia limpia fuera de Documents con el mismo código y lockfile, conservando el
    trabajo original. Tres referencias inválidas se apartaron con copia recuperable en `/tmp`.
    Sin cambios de BD remota, `.env.local` original ni paneles de Vercel/Supabase.

## Fase 8 — Finanzas (M8)

Libro de ingresos y egresos por propiedad y casa (unidad), reportes de rendimiento estilo Airbnb y Excel para
el contador. Empieza con registro manual; la carga automática desde reservas y calendario llega en SD-807.
Decisiones (moneda, dos bases de cálculo, permisos, comprobantes privados): ADR 0007.
**Orden acordado (2026-10-25)**: SD-705 → SD-801…806 antes de retomar las Fases 3–4; SD-807 espera a SD-305 y SD-401.

### [x] SD-801 · feat(db): finance ledger
`M` · Depende: SD-204, SD-705 · Review: `R+S`
- **Alcance**:
  - `finance_categories` por organización (`kind` `income|expense`, nombre, orden, archivada) con categorías
    por defecto sembradas en orgs existentes y nuevas. Ingresos: Alquiler, Servicios extra, Otros. Egresos:
    Limpieza, Mantenimiento, Agua, Luz, Internet, Gas, Insumos, Lavandería, Comisiones de plataforma,
    Impuestos y arbitrios, Personal, Otros.
  - `finance_entries`: `occurred_on` (fecha de cobro/pago), `amount_cents` > 0, `currency`, `fx_rate_pen`
    obligatorio si la moneda no es PEN, `amount_pen_cents` generado, `unit_id` nullable (null = gasto general),
    categoría con FK compuesta que fija `kind`, `payment_method`, contraparte, nota. Para alquileres:
    `stay_start`/`stay_end` (`[)`), `channel` (`direct|airbnb|booking|other`), huéspedes.
    `related_entry_id` para ligar limpieza/mantenimiento/comisión a su alquiler. `receipt_path`,
    `created_by`, `source` (`manual|booking|ical`) y `external_ref` único por org para cargas idempotentes.
  - `finance_unit_settings.cleaning_cost_cents` opcional (costo de limpieza sugerido por casa): tabla aparte, no una
    columna de `units`, porque `units` es legible por `anon` en el sitio público.
  - RLS: owner lee y edita todo; staff inserta y solo lee/edita lo que creó (`created_by = auth.uid()`).
    Helper `private.is_owner(org_id)`.
  - Bucket **privado** `finance-receipts` (`{org_id}/...`, JPEG/PNG/WebP/PDF, 5 MB): insertar miembros de la
    org; leer el owner o quien lo subió; sin lectura pública.
- **Criterios**
  - [x] pgTAP `0010_finance_ledger.test.sql` (81 asserts): staff no ve entradas ni comprobantes de otros; otra org y `anon`
        no ven nada; USD sin tipo de cambio falla; categoría de otra org o de `kind` distinto falla; `external_ref` duplicado falla.
  - [x] ADR 0007 aceptado.
- **Nota de cierre**:
  - Migración `20261027184334_finance_ledger.sql`: `finance_categories` (15 por defecto con `system_key` estable, sembradas
    para orgs existentes y por trigger para las nuevas), `finance_entries` con conversión a PEN generada por la BD
    (`round` mitad hacia arriba), `private.is_owner`, `finance_unit_settings` (costo de limpieza por unidad; lectura de miembros, escritura del dueño) y bucket privado `finance-receipts`.
  - Decisiones de integridad: la categoría fija org y `kind` por FK compuesta; una unidad con historial no se puede borrar
    (`on delete restrict`, se desactiva); borrar un alquiler deja sus costos como egresos sueltos (`set null`).
    `created_by`, `source` y `external_ref` no son escribibles por usuarios (solo cargas de confianza, SD-807).
  - Hallazgos de review aplicados: el costo de limpieza se movió fuera de `units` (lo leía cualquier visitante con la clave
    pública); las categorías de sistema no se pueden borrar (solo renombrar/archivar); una categoría del usuario con el nombre
    de una de sistema se adopta al re-sembrar; el enlace `related_entry_id` se valida en un trigger que solo actúa cuando el
    vínculo cambia, para que el staff pueda seguir editando una entrada que el dueño enlazó a algo que no ve.
  - Hallazgo propio corregido durante las pruebas: dentro de la política de `INSERT`/`UPDATE`, `related_entry_id` sin calificar
    se resolvía contra la tabla interna de la subconsulta y bloqueaba todo enlace (fallaba cerrado); ahora se califica la
    columna de la fila externa y hay pruebas positiva y negativa.
  - Seed local: usuario `staff@saywalodges.test` (rol `staff` en Saywa) para ejercitar permisos. Sin datos financieros en producción.
  - Despliegue: aplicar la migración con el procedimiento del proyecto antes de usar SD-803; no rompe el código actual.

### [x] SD-802 · feat(domain): finance calculations
`S` · Depende: SD-801 · Review: `R`
- **Alcance**: `lib/domain/finance.ts` puro: conversión a PEN con redondeo exacto (BigInt, como `pricing.ts`),
  totales por mes/categoría/casa, utilidad por alquiler (ingreso − comisión − costos ligados). Reutiliza el
  convertidor decimal→céntimos de SD-207.
- **Criterios**
  - [x] Cobertura ≥ 90 % en las cuatro métricas: `finance.ts` al 100 % (sentencias, ramas, funciones y líneas); CI lo exige por archivo.
- **Nota de cierre**:
  - `lib/domain/finance.ts` puro, sin I/O: `toPenCents` replica la columna generada de la BD (BigInt, mitad hacia arriba,
    tipo de cambio `0 < tc < 100`, PEN sin tipo de cambio) para que el formulario muestre el mismo valor que se guardará;
    `positiveMoneySchema` reutiliza `moneySchema` de SD-207 (decimal a céntimos exacto, mayor que cero).
  - `summarizeEntries` suma el `amount_pen_cents` guardado (una sola fuente de verdad con la BD) por mes, categoría y casa
    (el gasto general va al final), con rango de fechas inclusivo y margen en puntos básicos redondeado lejos de cero.
    `rentalProfits` calcula bruto, comisión de plataforma, otros costos ligados y neto por alquiler.
  - Errores tipados (`INVALID_AMOUNT`, `AMOUNT_OVERFLOW`, etc.) en vez de redondear pasado `MAX_SAFE_INTEGER`.
  - `finance.ts` se agregó a la cobertura exigida (`vitest.config.mts`) y a `npm run test:pricing`.
  - Base de cálculo: este módulo es **por cobro** (caja). El prorrateo por noche para ocupación/ADR/RevPAR es SD-804.

### [x] SD-803 · feat(dashboard): income and expense register
`L` · Depende: SD-801, SD-802 · Review: `R+S`
- **Alcance**: `/app/finance` (nav "Finanzas"). Botones "+ Ingreso" / "+ Egreso"; formulario corto con fecha de
  hoy, categoría en chips, casa o "General", foto con la cámara (`capture`). Alquiler: casa, fechas, canal,
  huésped, **monto bruto y comisión de plataforma** (crea el egreso de comisión ligado) y casilla "Agregar
  limpieza" con el costo de la casa. Tipo de cambio prellenado con el último usado. Lista con filtros
  (mes, tipo, categoría, casa) y tarjetas en móvil; cada alquiler muestra sus costos y utilidad. KPIs del mes.
  Staff ve solo "Registrar" y sus propios movimientos. Comprobantes por enlace firmado de corta duración.
- **Reglas de seguridad para la implementación** (revisión de SD-801):
  - Comprobantes: subir, firmar (`createSignedUrl`) y borrar **siempre con el cliente de sesión**, nunca con service-role; así
    aplican las políticas de `finance-receipts` y un staff no puede firmar/borrar el comprobante de otro aunque apunte su
    `receipt_path` a él. Nombres de objeto = uuid aleatorio bajo `{org_id}/receipts/`; la ruta la construye el servidor.
  - Tipo de archivo por contenido (magic bytes JPEG/PNG/WebP/PDF) y 5 MB validados en la server action; el `Content-Type`
    del cliente no es de fiar.
  - El staff no ve `finance_unit_settings` editable ni totales; el DAL no ofrece edición del costo de limpieza al staff.
- **Criterios**
  - [x] Staff no ve totales ni movimientos ajenos (verificado con sesión real contra Supabase local, no solo política).
  - [x] Registrar un alquiler con limpieza y comisión crea tres movimientos ligados en una sola operación (`create_rental_entries`, pgTAP `0011`).
  - [x] Comprobante no aceptado por contenido (p. ej. SVG/HTML con extensión de imagen) se rechaza (`app/app/finance/actions.test.ts`).
- **Nota de cierre**:
  - Pantallas: `/app/finance` (mes anterior/siguiente, filtros por tipo/categoría/casa, tarjetas de ingresos, egresos, utilidad y margen
    solo para el dueño, lista con la utilidad de cada alquiler), `/app/finance/new?type=rental|income|expense` y `/app/finance/[id]`
    (editar/borrar con confirmación). Entrada "Finanzas" en el menú. El staff ve solo "Registrar" y sus propios movimientos.
  - `public.create_rental_entries` (migración `20261027195656`): `SECURITY INVOKER`, así que RLS, permisos por columna y el trigger de
    enlace se aplican a cada insert; la org sale de la unidad, nunca de un parámetro; los tres movimientos se escriben o ninguno. Los
    parámetros opcionales tienen `default null` y se llama con argumentos con nombre (si no, los tipos generados los exigen no nulos).
    Comisión y limpieza usan la moneda y el tipo de cambio del alquiler (un registro, un tipo de cambio).
  - Comprobantes: subida con el cliente de sesión a `finance-receipts`, tipo real por magic bytes (JPEG/PNG/WebP/PDF) y 4 MB, ruta
    `{org}/receipts/{uuid}.ext` generada por el servidor; si falla el guardado se borra el objeto; reemplazar borra el anterior
    solo después de guardar; la ruta `/app/finance/receipt/[id]` autoriza al hacer clic con la sesión del usuario y firma 60 s.
    Verificado: un staff no firma el comprobante de otro ni falsificando `receipt_path`.
  - Hallazgos de review aplicados: el comprobante debe existir y ser visible para quien lo asigna, con formato exacto y un solo uso
    (disparador + restricciones + índice único, migración `20261027204814`); `create_rental_entries` recibe la organización de la
    sesión y exige que coincida con la de la unidad; borrar un alquiler borra también su comisión y limpieza y devuelve los
    comprobantes por limpiar (`delete_finance_entry`, atómica); los totales son siempre del mes completo, sin importar los filtros;
    `capture` para la cámara; errores asociados a sus campos; un alquiler editado conserva moneda y categoría; consultas por lotes.
  - Costo de limpieza sugerido: se precarga solo si la moneda del alquiler es la de la propiedad.
  - Fuera de alcance: administrar categorías (renombrar/archivar/crear) y el costo de limpieza por unidad desde la UI; los datos existen y
    se leen, pero hoy se cargan por la BD. Nota para SD-804/805: reportes por estadía y Excel. La barra inferior móvil ahora tiene 8 ítems.
  - Pruebas: pgTAP 338 en 12 archivos (nuevos `0011` y `0012`), Vitest con DAL, acciones, formularios y vista; verificación con
    sesiones reales de dueño, staff y otra organización; páginas renderizadas con datos reales.
  - Despliegue: aplicar `20261027195656_finance_rental_rpc.sql` y `20261027204814_finance_receipt_guard.sql` en producción (junto con
    `20261027184334_finance_ledger.sql` si aún no se aplicó) antes de usar la pantalla; después `get_advisors`. No hay datos financieros en producción.

### [x] SD-804 · feat(finance): performance reports
`L` · Depende: SD-802, SD-803 · Review: `R`
- **Alcance**: `lib/domain/finance-reports.ts` puro + `/app/finance/reports` (solo owner). Selector de base
  **por estadía** (prorrateo por noche, para rendimiento) o **por cobro** (caja, para el contador).
  - Mensual: bruto, comisiones y neto por canal; egresos por categoría (top 5); utilidad y margen; por casa:
    noches reservadas/disponibles, ocupación %, ADR, RevPAR, estadía promedio, nº de alquileres; comparación
    con el mes anterior y el mismo mes del año pasado; utilidad por alquiler.
  - Anual: 12 meses (ingresos, egresos, utilidad, ocupación, ADR, noches), acumulado del año, año contra año,
    mejor/peor mes y estacionalidad. Gráficos en SVG propio (sin dependencia).
  - Global: ranking de casas, mezcla de canales y ahorro en comisiones de las reservas directas, costo promedio
    de limpieza/mantenimiento por alquiler.
  - Estado de resultados mensual/anual imprimible (CSS de impresión → PDF del navegador) con logo y período.
  - Noches disponibles = días con la casa activa; nota visible hasta que SD-807 descuente bloqueos del dueño.
- **Criterios**
  - [x] Un alquiler que cruza meses reparte noches e ingreso por noche en "por estadía" y cae entero en la fecha
        de cobro en "por cobro" (tests de `finance-reports.test.ts`).
  - [x] Cobertura ≥ 90 % de `finance-reports.ts`; cifras del panel iguales a las del motor para el mismo período
        (las vistas solo formatean lo que devuelve el motor; `prepareReport` se calcula una vez por solicitud).
- **Avance — parte 1, motor de cálculo (hecha)**: `lib/domain/finance-reports.ts`, puro y sin I/O.
  - Todo sale de una sola lista de "tajadas" (monto + fecha): `prepareReport` la construye una vez y `periodReport`,
    `monthReport`, `yearReport` y `globalReport` solo la agrupan, así que el panel, el estado imprimible y el Excel (SD-805)
    no pueden discrepar. Base **por cobro**: cada movimiento cuenta entero en su fecha. Base **por estadía**: el ingreso del
    alquiler y los costos ligados (comisión, limpieza, otros) se reparten por noche, con el residuo de céntimos en la última
    noche; los gastos generales y los ingresos sin estadía se quedan en su fecha.
  - Noches, ocupación, tarifa promedio por noche (ADR) e ingreso por noche disponible (RevPAR) son siempre por estadía,
    cualquiera sea la base del dinero. Noches disponibles = días del período desde que la casa existe, si está activa; no se
    descuentan bloqueos del dueño hasta SD-807 (la UI debe decirlo).
  - Mensual con comparación contra el mes anterior y el mismo mes del año pasado (diferencia y porcentaje en puntos básicos,
    `null` cuando la base es 0); anual con 12 meses, total, año anterior, mejor y peor mes (solo meses con actividad;
    empate al más temprano); global con ranking por **utilidad**, mezcla de canales, ahorro estimado por reservas directas
    (tasa de comisión de Airbnb y Booking aplicada al bruto directo) y costo promedio de limpieza y mantenimiento por alquiler.
  - `prepareReport` valida una sola vez que los montos suman un entero seguro, así que ningún total posterior puede desbordar.
  - Cobertura de `finance-reports.ts`: 100 % de sentencias, funciones y líneas y 99,3 % de ramas (exigido por archivo en CI).
  - Revisión aplicada: la ventana de disponibilidad de una casa abre en su creación **o en su primera noche reservada** si se cargó
    historia anterior (antes daba ocupación > 100 %); una casa desactivada **conserva su historia** (opera hasta su fecha de baja,
    `availableUntil`, o hasta su última noche reservada) en vez de pasar a 0 noches disponibles; una estadía de 0 noches o con fechas
    mal formadas devuelve `INVALID_STAY` en vez de lanzar; el tope de suma de montos pasó a `MAX_SAFE_INTEGER / 10000` para que
    ninguna razón en puntos básicos pierda precisión; el ahorro estimado se redondea una sola vez desde la razón exacta.
  - Parte 2 (hecha): `/app/finance/reports` (mensual, anual, global; solo dueño, staff recibe 404), estado de resultados imprimible en
    `/app/finance/reports/statement` (siempre en paleta clara al imprimir), DAL `lib/dal/finance-reports.ts` y `listAllEntries` (tope de
    20.000 filas con aviso de cifras parciales), gráficos SVG con tabla de datos accesible. Cumple las reglas de abajo. Ya no pendiente: DAL de lectura de unidades/entradas para reportes, `/app/finance/reports` (solo dueño, selector de base),
    gráficos SVG, estado de resultados imprimible y la nota de bloqueos del dueño; criterio de "cifras del panel iguales a las del motor".
    Reglas que la UI y el DAL de la parte 2 deben respetar (de la revisión):
    - Pasar **todas** las casas, archivadas incluidas (si falta una, su dinero cuenta en los totales pero no en la tabla por casa), y
      `availableUntil` de las inactivas (p. ej. `updated_at` de la desactivación).
    - Rotular el ahorro por reservas directas como **estimación referencial** y mostrar la tasa usada: mezcla Airbnb y Booking en una
      tasa ponderada, supone que se registró cada comisión y que la demanda sería la misma por la plataforma.
    - Rotular los promedios de limpieza y mantenimiento como "ligados a alquileres" (el mantenimiento casi nunca se liga a uno).
    - Los porcentajes de la mezcla de canales se redondean uno a uno y pueden no sumar exactamente 100 %; mostrar "≈".
    - Aclarar el conteo de alquileres por base: en "por cobro" cuentan los cobrados en el período; en "por estadía" los que tienen noches
      en él (una estadía que cruza meses cuenta en cada mes). Un costo ligado conserva su propia casa si la tiene.
    - Calcular `prepareReport` una vez por solicitud (con miles de noches reparte una tajada por noche) y no por período.

### [x] SD-805 · feat(finance): accountant Excel export
`M` · Depende: SD-803, SD-804 · Review: `R+S`
- **Alcance**: route handler solo owner que genera `.xlsx` en el servidor con `exceljs` (dependencia nueva:
  fechas y números reales, sin binarios nativos). Rango: mes, año o personalizado. Hojas: Resumen (mes ×
  ingresos/egresos/neto en PEN, por categoría y casa), Ingresos, Egresos (moneda, monto, TC, PEN, medio,
  alquiler relacionado, comprobante sí/no), Rendimiento (mes × casa) y Por alquiler. Encabezado congelado,
  autofiltro, `#,##0.00`, fila de totales con `SUM`.
- **Criterios**
  - [x] Test que relee el archivo generado: tipos de celda (fecha/número), totales y hojas esperadas.
  - [x] Staff y otra org reciben 404/redirect, no un archivo.
- **Avance**: `lib/domain/finance-export.ts` (modelo puro del libro: período desde la URL `?month=`, `?year=` o `?from=&to=`, tope 5 años,
  cobertura ≥ 90 % exigida), `lib/finance-xlsx.ts` (escritor con `exceljs`) y `GET /app/finance/export` (solo dueño; personal y sin org
  reciben 404 vacío, anónimo va al login; se lee siempre la org de la sesión; se niega a exportar un libro incompleto, 422).
  Resumen, Ingresos, Egresos y Por alquiler son **por cobro**; Rendimiento es **por estadía** y lo dice en el nombre de la hoja.
  Los textos del usuario se escriben como cadenas, nunca como fórmulas. Botones de descarga (mes, año y rango) en `/app/finance/reports`.
  - Dependencia nueva: `exceljs@4.4.0` (+98 paquetes en el lock; solo en servidor, sin binarios nativos). Alternativas descartadas: `xlsx`
    (SheetJS) no se publica en npm y tiene su propio historial de avisos; escribir el XML a mano es más frágil que una librería probada.
    Riesgos aceptados: el paquete no tiene releases desde dic. 2024, y `npm audit` marca `uuid<11.1.1` (moderado, GHSA-w5hq-g745-h8pq: falta
    de comprobación de límites en v3/v5/v6 con `buf`). No es alcanzable: `exceljs` fija `uuid@^8` y solo llama a `uuid.v4()` sin buffer
    (`cf-rule-ext-xform.js`), y `uuid` no recibe entrada de usuario. El arreglo que ofrece `npm audit` es bajar a `exceljs@3.4.0` (peor). No se
    probó forzar `uuid@11` con `overrides`.
  - Un export rechazado (rango inválido, libro incompleto, datos inválidos) redirige a `/app/finance/reports?exportError=<código>` y la
    página muestra el motivo con `role="alert"`; nunca se refleja texto de la petición.

### [x] SD-806 · feat(finance): recurring expenses
`S` · Depende: SD-803 · Review: `R`
- **Alcance**: plantillas mensuales (agua, luz, internet…) con día y monto estimado; cada mes aparecen como
  "pendientes" y se confirman con el monto real en un clic. Sin cron.
- **Criterios**
  - [x] Confirmar dos veces el mismo pendiente no duplica el egreso.
- **Avance**: migración `finance_recurring` (plantillas) + `finance_recurring_runs` (una fila por plantilla y mes) + RPC
  `confirm_recurring_expense` (SECURITY INVOKER; bloquea la plantilla `FOR UPDATE`, así que dos confirmaciones simultáneas del mismo mes
  se encolan y la segunda devuelve el egreso de la primera con `created = false`). Todo **solo del dueño** (RLS; el personal no ve ni
  confirma). Dominio puro `lib/domain/finance-recurring.ts` (pendientes por mes, meses atrasados, esquemas; cobertura ≥ 90 % exigida),
  DAL `lib/dal/finance-recurring.ts`, acciones (re-chequean el rol y rechazan meses futuros) y pantallas `/app/finance/recurring`
  (lista, nuevo, editar, pausar, eliminar) más la tarjeta "Gastos recurrentes pendientes de {mes}" en `/app/finance` con aviso de meses anteriores sin confirmar.
  Si se borra el egreso confirmado, ese mes vuelve a quedar pendiente. Eliminar una plantilla conserva los egresos ya confirmados.
  Fecha del egreso: el día de la plantilla (editable dentro del mes); moneda y tipo de cambio se fijan al confirmar.
  - La RPC también rechaza plantillas pausadas, meses que no han empezado (hora de Lima) y una moneda distinta a la de la plantilla.
  - Deuda menor anotada: no hay acción "omitir este mes" (un mes sin factura, o meses de una plantilla pausada y reanudada, siguen
    apareciendo como atrasados hasta 12 meses); propuesta de ticket aparte.


### [ ] SD-807 · feat(finance): automatic income from bookings and calendar
`M` · Depende: SD-305, SD-401, SD-803 · Review: `R+S`
- **Alcance**: reservas directas: al confirmar el pago se crea el ingreso (`source = booking`, `external_ref`
  = pago, idempotente). Airbnb/Booking: iCal solo trae fechas, así que cada estadía importada sin ingreso
  aparece en "Alquileres por completar" con limpieza sugerida. Ocupación de SD-804 descuenta bloqueos del dueño.
- **Criterios**
  - [ ] Reprocesar el mismo pago o el mismo evento iCal no duplica movimientos.


## Propuesta de ticket fuera del alcance actual

- **Mantenimiento de dependencias y revisión de avisos de seguridad** (convertido en SD-705): `npm audit` durante SD-206
  reportó 9 paquetes con avisos (incluido Next.js 16.2.6 con severidad crítica). Las versiones afectadas
  coinciden con `main`; el complemento de cobertura no introduce esos avisos. Evaluar exposición real,
  actualizar dependencias y verificar rutas/host/auth en un ticket propio, antes de ampliar la publicación.
  Informe consultado el 2026-10-23; no se ejecutó `npm audit fix` ni actualizaciones generales en SD-206.
