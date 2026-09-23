---
name: testing
description: Estrategia de tests de Saywa Direct - qué test escribir según el tipo de cambio (Vitest para dominio, pgTAP para RLS/RPCs, Playwright para flujos críticos) y cómo escribirlos. Usar al implementar o revisar cualquier ticket.
---

# Testing

## Qué test exige cada cambio

| Cambio | Test obligatorio | Herramienta |
|---|---|---|
| `lib/domain/**` (pricing, availability, fechas) | Unitarios con casos borde | Vitest |
| Parsers/generadores (iCal, zod schemas) | Unitarios con fixtures reales anonimizados | Vitest |
| Tabla nueva / política RLS | Aislamiento entre orgs y acceso `anon` | pgTAP |
| RPC / constraint | Caso feliz + rechazo (+ concurrencia si reserva fechas) | pgTAP |
| Flujo crítico de negocio | Solo los listados abajo | Playwright |
| UI de presentación | Ninguno automático; verificación manual en `npm run dev` | — |

Flujos e2e (máximo 3): link de reserva → datos → voucher → aprobación en dashboard;
login al dashboard; pago Mercado Pago en sandbox (cuando exista).

## Cómo escribirlos
- Tests unitarios junto al código: `lib/domain/pricing.test.ts`.
- Nombres que describen comportamiento: `it("applies high-season rate to nights inside the season")`.
- Fechas siempre explícitas (`"2026-12-24"`), nunca `new Date()` sin fijar el reloj (`vi.setSystemTime`).
- Dinero en céntimos en los asserts.
- Casos borde mínimos para fechas: estancia que cruza el cambio de temporada, check-out el día
  de inicio de otra reserva (no es solape), 0 noches (inválido), fin de año, feriados.
- pgTAP: usa helpers para autenticar como usuario de una org (`set local role authenticated` +
  `request.jwt.claims`) y como `anon`.
- Sin snapshots de componentes. Sin mocks de Supabase para probar RLS: se prueba contra la BD local.

## Cobertura
Alta solo donde importa: `lib/domain` ≥ 90 %. En el resto no hay objetivo numérico; manda la tabla.
