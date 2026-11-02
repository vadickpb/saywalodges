# ADR 0001 · Multi-tenant por host en una sola aplicación Next.js

- Estado: aceptado · Fecha: 2026-09-23 · Modificado parcialmente por [ADR 0010](0010-installation-per-client.md) (modo instalación por cliente)

## Contexto
Cada alojamiento necesita su propio sitio (subdominio o dominio propio) y un panel de gestión.
Somos un solo desarrollador: el costo operativo debe ser mínimo.

## Decisión
Una sola app Next.js desplegada en Vercel (patrón Vercel for Platforms).
`proxy.ts` lee el header `host` y reescribe:
- `{sub}.<root>` y dominios propios → `/sites/[host]/[lang]/...`
- `app.<root>` → `/app/...` (dashboard)
- `<root>` → landing.

El proxy no consulta la BD ni autoriza: la página resuelve `host → property` con una función
cacheada y responde 404 si no existe o no está publicada.

### Mecánica concreta (SD-105)
- `ROOT_DOMAIN` en `lib/env.ts` (default `localhost:3000`, el real en producción vía Vercel).
  `proxy.ts` compara el header `host` contra él: igual → landing (sin rewrite); termina en
  `.ROOT_DOMAIN` → el sufijo se quita y el resto es el `siteIdentifier` (subdominio); cualquier
  otro valor se asume dominio propio y se usa tal cual como `siteIdentifier` — sin validarlo
  contra la BD, igual que el proxy nunca valida nada.
- `lib/dal/public/site.ts`: `getSiteByHost(host)` (`cache()`) resuelve `siteIdentifier` →
  `{ slug }` consultando `properties.subdomain`/`custom_domain` por separado (dos `.eq()`, no un
  único `.or("subdomain.eq.<host>,...")`: ese valor viene del header `Host`, controlable por
  quien hace la request, y la sintaxis de filtro cruda de PostgREST no escapa comas/puntos).
- `app/sites/[host]/[lang]/{layout,page}.tsx` llaman `getSiteByHost` + `getProperty(slug)`; como
  la política RLS de `properties` ya es `is_member OR published`, una propiedad no publicada
  simplemente no existe para el cliente anon — mismo 404 que un host desconocido.
- **Root layouts múltiples**: no hay un `app/layout.tsx` compartido. Cada árbol tiene el suyo con
  su propio `<html>/<body>`: `app/sites/[host]/[lang]/layout.tsx` (lee `<html lang>` directo del
  route param, nunca de `headers()`), `app/app/layout.tsx` (dashboard) y
  `app/(platform)/layout.tsx` (route group: landing placeholder, login, recuperación de
  contraseña y callback de auth — las rutas de la plataforma).
  Efecto secundario real: al dejar de depender de `headers()`, varias de esas páginas pasaron de
  `ƒ` (dinámica forzada) a `○` (estática) en el build.
- `app/sitemap.ts`/`app/robots.ts` leen el host vía `headers()` (son archivos de nivel raíz, sin
  acceso al route param `[host]`) para construir URLs por tenant — eso los saca del cache estático
  por defecto de Next.js, intencional.

## Consecuencias
- Un deploy sirve a todos los tenants; una plantilla compartida con tema por tenant.
- Un bug de aislamiento afecta a todos → mitigado por RLS (ADR 0002).
- Dominios propios requieren la API de dominios de Vercel — SD-105 deja el mecanismo de
  resolución listo (`custom_domain` ya se consulta), pero la UI para que un tenant configure su
  propio dominio es SD-604, todavía no construida.

## Alternativas descartadas
- Un deploy por cliente: no escala operativamente.
- Rutas por path (`saywa.pe/s/cliente`): peor para marca y SEO del cliente.
