# Cola de trabajo

Es la **única fuente del orden de trabajo**. `docs/roadmap.md` dice *qué* es cada ticket; este archivo dice
*cuándo* se hace y *quién* lo hace. Lo mantiene el coordinador (Claude) y el dueño lo aprueba por lotes.
El proceso completo está en [`docs/workflow.md`](workflow.md#modo-automático-sd-901) y la guía del dueño en
[`docs/guia-dueno.md`](guia-dueno.md).

## Cómo se lee

- **Lote**: un grupo de 3–5 tickets con un objetivo común. El dueño aprueba un lote entero con una palabra
  («dale al lote N»); dentro del lote los tickets avanzan solos.
- **Quién**: `Codex` implementa UI, CRUD, textos, tests y docs. `Claude` implementa base de datos, RLS, RPC,
  dinero, seguridad y diseño. Quien no implementa, revisa (si el PR es `risk:high`).
- **Riesgo**: lo pone GitHub solo (`risk:low` / `risk:high`) según los archivos del PR. `risk:low` se mergea
  solo con CI verde; `risk:high` pasa por la revisión de Claude.
- **Estado**: `pendiente` → `en curso` (con rama) → `PR #n` → `hecho`. Un lote se cierra cuando todos sus
  tickets están `hecho` y el dueño revisó la demo.
- Como máximo **3 tickets en curso a la vez**, y nunca dos que toquen los mismos archivos.

## Lote 1 · Cerrar el flujo de reservas (en curso)

| Ticket | Qué | Quién | Estado |
|---|---|---|---|
| SD-407 | Emails del ciclo de la reserva + aviso al dueño de cada comprobante | Codex | en curso (`feat/SD-407-booking-emails`) |
| SD-410 | E2E Playwright del flujo completo en CI | Codex | en curso (`test/SD-410-e2e-booking`) |
| SD-412 | Purga de comprobantes huérfanos/rechazados | Codex (+ revisión de seguridad de Claude) | en curso (`feat/SD-412-voucher-purge`) |
| SD-901 | Trabajo automático: cola, riesgo, auto-merge, guía del dueño | Claude | hecho (#64) |

## Lote 2 · Saywa Lodges en producción con huéspedes reales

Objetivo: la primera reserva real pagada por el sistema. Es lo que valida el producto antes de venderlo.

| Ticket | Qué | Quién | Estado |
|---|---|---|---|
| SD-902 | Ordenar el roadmap: cerrar los `[~]` que ya cumplen, mover sobrantes a tickets nuevos | Codex | pendiente |
| SD-409 | Anti-abuso: límite por origen, BotID/captcha en cotizar, reservar y subir comprobante | Claude | pendiente |
| SD-413 | Reserva manual, pago de saldo, *snapshot* del huésped, aprobar/cancelar solo el dueño | Claude | pendiente |
| SD-701 | CSP y cabeceras de seguridad | Codex (+ revisión de seguridad) | pendiente |
| SD-702 | Checklist de producción (backups probados, dominios, cron, monitoreo activo) | Claude + dueño | pendiente |

Decisiones del dueño que bloquean este lote: ver [`docs/decisiones-pendientes.md`](decisiones-pendientes.md).

## Lote 3 · Versiones y operación para vender

| Ticket | Qué | Quién | Estado |
|---|---|---|---|
| SD-903 | Versiones: `release-please` (CHANGELOG + etiquetas `vX.Y.Z`); `main` → demo, versión → clientes | Claude | pendiente |
| SD-605 | Registro de auditoría (cambios de cuentas de pago, aprobaciones) | Claude | pendiente |
| SD-606 | Errores y logs centralizados | Codex | pendiente |
| SD-1009 | WhatsApp: plantillas de reserva y opt-in del huésped | Codex (+ revisión de seguridad) | pendiente |

## Lote 4 · Mercado Pago

SD-501 → SD-502 → SD-503 → SD-504 → SD-505, en ese orden (cada uno depende del anterior). Claude implementa
501, 502 y 504 (dinero y webhook); Codex 503 y 505.

## Después (sin lote)

SD-1006 (web de ventas, necesita precio aprobado), SD-601 y SD-602 (CRM y check-in), SD-807 (ingresos
automáticos), SD-307 (sincronización iCal programada), SD-703 (portafolio), SD-1001 pendiente (`siteOrigin`).

## Mantenimiento semanal (lunes, automático)

- Dependabot abre PRs de dependencias (`risk:high`): Claude los revisa y mergea en una pasada.
- `Installation health` vigila las instalaciones y avisa por email si algo falla.
- El coordinador limpia worktrees y ramas locales ya mergeadas.
