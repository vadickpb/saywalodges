# ADR 0009 · CSP con nonce por petición y headers de seguridad

- Estado: aceptado (SD-701) · Fecha: 2026-10-30 · **Chrome real en CI (carga inicial) añadido; preview report-only pendiente** (ver "Verificación en navegador" y "Pendiente")

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

## Verificación en navegador (Chrome real, en CI)
`scripts/lighthouse-mobile.mjs` (job `db`, stack local sembrado, sin servicios de pago ni dependencias nuevas)
reutiliza las cargas Lighthouse móvil de SD-209 y añade `--only-audits=errors-in-console`: no cambia las
categorías ni los umbrales (rendimiento y accesibilidad ≥ 90, mediana de 3 cargas). Chrome reporta cada bloqueo
CSP como error de consola; `lib/security/lighthouse-csp.ts` (pura, con test) los separa del resto y **cualquier
violación CSP en cualquiera de las cargas falla el job**. Otros errores de consola (p. ej. un 404 de favicon)
se imprimen como `NOTE` sin fallar, para no volver el CI frágil.
- **Alcance exacto**: carga inicial (`/es`) de `saywa-lodges.localhost` y `demo.localhost` en producción
  (`next start`). No ejecuta interacciones (widget de reserva, calendario), el dashboard, el login contra
  Supabase real, ni `/en` (se puede ampliar con `LH_LANGS=es,en`).
- **Canario anti-vacío**: antes de medir, el script sirve una página local con un CSP que bloquea su propio
  script inline y exige que la auditoría lo detecte. Si Lighthouse cambia/renombra la auditoría, falla en
  `NO_FCP` o no detecta el canario, el job falla en vez de pasar sin medir. Probado en Chrome 156 + Lighthouse
  13.6.0 en local (violación detectada, página limpia sin hallazgos).
- **No verificado en local**: el tramo con Supabase sembrado (no hay Docker en la máquina de desarrollo); lo
  ejecuta el job `db` tras el push.

## Pendiente
- Revisar la consola en un preview con `CSP_REPORT_ONLY=1` (el modo report-only sigue disponible y sin cambios)
  sobre: interacciones del sitio de tenant, dashboard (toasts, selects, uploads) y login contra Supabase real.
  Nada de eso lo cubre el job de CI; hasta hacerlo, esas superficies no están validadas en navegador.
- Tras la revisión, retirar `CSP_REPORT_ONLY` del preview; la producción nunca lo usa.
