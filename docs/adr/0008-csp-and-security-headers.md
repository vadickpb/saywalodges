# ADR 0008 · CSP con nonce por petición y headers de seguridad

- Estado: aceptado (SD-701) · Fecha: 2026-10-30 · **Validación en navegador sobre sitios de tenants pendiente** (ver "Pendiente")

## Contexto
La app renderiza HTML con datos de tenants (nombre, textos, tema) y usa Supabase (Auth/Storage) desde el
navegador. Un CSP estricto limita el daño de un XSS. Next 16 aplica el nonce al renderizar en servidor,
leyéndolo del header CSP de la petición reenviada por `proxy.ts`.

## Decisión
- `proxy.ts` genera un nonce (16 bytes aleatorios, base64) **por petición**, construye el CSP con
  `lib/security/csp.ts` (función pura, probada) y lo pone en la petición reenviada (`x-nonce` +
  `Content-Security-Policy`, para que Next lo estampe en sus scripts) y en la respuesta. Cubre rewrites de
  host/idioma, rutas de plataforma, redirects, errores 400/404 y `/api/*` (cron, iCal). No consulta la BD ni
  autoriza; el refresco de sesión de SD-103 se conserva (los headers se copian *después* de refrescar).
- Política de producción:
  `script-src 'self' 'nonce-…' 'strict-dynamic'` · `style-src 'self' 'nonce-…'` ·
  `style-src-elem 'self' 'nonce-…' 'sha256-<sonner>'` · `style-src-attr 'unsafe-inline'` ·
  `img-src 'self' data: blob: <origen Supabase>` · `connect-src 'self' <origen Supabase>` · `font-src 'self'` ·
  `frame-src 'none'` · `object-src 'none'` · `base-uri 'self'` · `form-action 'self'` ·
  `frame-ancestors 'self'` · `upgrade-insecure-requests`.
- **Sin `unsafe-eval`** (solo en `next dev`, como indica la guía de Next) y **sin `unsafe-inline` en scripts ni
  en elementos `<style>`** en producción.
- Excepciones documentadas:
  1. `style-src-attr 'unsafe-inline'`: los atributos `style=""` no admiten nonce. Lo necesitan el tema del
     tenant (SD-209: variables CSS en `<body style>`, ya validadas por `themeToCssVars`) y los estilos que
     Radix/sonner emiten en el HTML del servidor. Solo cubre atributos: no ejecuta scripts ni permite inyectar
     elementos `<style>`. Alternativa descartada por ahora: mover el tema a `<style nonce>` (no elimina los
     atributos de Radix/sonner).
  2. `sonner` inyecta un `<style>` sin soporte de nonce: se permite **solo ese CSS por hash**
     (`SONNER_STYLE_HASH`). `lib/security/csp.test.ts` recalcula el hash desde `node_modules/sonner` y falla al
     actualizar la librería (actualizar la constante entonces).
- Orígenes: solo el origen exacto de `NEXT_PUBLIC_SUPABASE_URL` (validado por `toExactOrigin`: https, o http
  en localhost/127.0.0.1; sin comodines, esquemas sueltos, rutas ni credenciales). Las imágenes de Storage
  pasan por `next/image` (`/_next/image`, mismo origen); el origen en `img-src` cubre `<img>` directos.
- Renderizado dinámico: el nonce solo llega a páginas renderizadas por petición. Los tenants y el dashboard
  ya eran dinámicos; `app/(platform)/layout.tsx` hace `await connection()` para que `/`, `/login`,
  `/forgot-password` y `/update-password` dejen de prerenderizarse. PPR/`cacheComponents` serían incompatibles.
- Headers sin nonce (`next.config.ts` → `staticSecurityHeaders`): `X-Content-Type-Options`,
  `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy: same-origin-allow-popups` y, solo en producción,
  `Strict-Transport-Security: max-age=63072000; includeSubDomains` (sin `preload`).
- `CSP_REPORT_ONLY=1` envía `Content-Security-Policy-Report-Only` (Next también lee el nonce de ese header),
  para validar en un preview sin bloquear nada.

## Mercado Pago (futuro, no integrado)
Hoy **no se añade ningún dominio de pagos**: `PAYMENT_PROVIDER_SOURCES` está vacío y un test lo exige.
El ticket que integre Mercado Pago debe, con la documentación oficial vigente en ese momento:
1. Elegir Checkout Pro por redirección (no requiere cambios: `form-action`/navegación no están limitados por
   CSP) o SDK en página. Si es SDK, cargarlo con `<Script nonce>` (`strict-dynamic` ya lo permite sin añadir
   host) y listar en `connect-src`/`frame-src`/`img-src` solo los **orígenes exactos** que el SDK use,
   pasando por `toExactOrigin` (sin comodines tipo `*.mercadopago.com` salvo que la documentación lo exija,
   justificado en el PR).
2. Añadir un test que fije esas listas y verificar con `CSP_REPORT_ONLY=1` en un preview.
3. Webhooks y consultas a la API son servidor→servidor: no tocan el CSP.

## Consecuencias
- Cada petición de página se renderiza en servidor (ya ocurría salvo 4 páginas de plataforma; menor caché CDN).
- `/_not-found` global sigue siendo estático: sus scripts no llevan nonce y el navegador los bloquea (la
  página de error es de solo lectura, sin hidratación necesaria; produce ruido en consola). Solo afecta a rutas
  inexistentes del dominio de plataforma.
- Actualizar `sonner` exige actualizar el hash (el test lo detecta).

## Pendiente (criterio no verificado)
Sin Docker/Supabase local en la implementación no se ejecutó el sitio de ningún tenant en un navegador, ni
Lighthouse (SD-209, ≥90). Lo comprobado: tests unitarios y de proxy, build, `scripts/test-csp-http.mjs
--no-db` (plataforma) y Chrome headless sin violaciones en `/` y `/login`. Antes de dar el ticket por
cerrado: correr en CI (job `db`: smoke CSP completo + Lighthouse) y revisar la consola en un preview con
`CSP_REPORT_ONLY=1` sobre un tenant, el dashboard (toasts, selects, uploads) y el login contra Supabase real.
