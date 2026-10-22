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

### [ ] SD-202 · feat(dashboard): site content and photo manager
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
  - [ ] Reordenar y guardar persiste el orden en el sitio.
  - [ ] Borrar un espacio borra sus fotos de BD y Storage.
  - [ ] Las fotos de espacios ya son editables (antes no lo eran).
  - [ ] Las 27 fotos reales siguen cargando tras la migración de rutas; ninguna URL rota.
  - [ ] Un usuario de otra org no puede subir/borrar en el prefijo de otra (verificado, no solo política escrita).

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
- **Alcance**: sección Tarifas con "desde S/ X" derivado de datos numéricos; eliminar `rate_tiers`; componentes
  públicos movidos a `components/site`; textos de UI genéricos (sin copy de Saywa en `dictionaries/`).
  El tema por tenant (colores, tipografía) se hace en SD-209.
- **Criterios**
  - [ ] El tenant `demo` muestra sus propios textos y tarifas.
  - [ ] Ningún texto específico de Saywa queda en código.

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
