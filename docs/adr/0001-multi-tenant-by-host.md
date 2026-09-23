# ADR 0001 · Multi-tenant por host en una sola aplicación Next.js

- Estado: aceptado · Fecha: 2026-09-23

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

## Consecuencias
- Un deploy sirve a todos los tenants; una plantilla compartida con tema por tenant.
- Un bug de aislamiento afecta a todos → mitigado por RLS (ADR 0002).
- Dominios propios requieren la API de dominios de Vercel.

## Alternativas descartadas
- Un deploy por cliente: no escala operativamente.
- Rutas por path (`saywa.pe/s/cliente`): peor para marca y SEO del cliente.
