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

## Lote 1 · Cerrar el flujo de reservas (cerrado)

| Ticket | Qué | Quién | Estado |
|---|---|---|---|
| SD-407 | Emails del ciclo de la reserva + aviso al dueño de cada comprobante | Codex | hecho (#74) |
| SD-410 | E2E Playwright del flujo completo en CI | Codex | hecho (#76) |
| SD-412 | Purga de comprobantes huérfanos/rechazados | Codex (+ revisión de seguridad de Claude) | hecho (#75) |
| SD-901 | Trabajo automático: cola, riesgo, auto-merge, guía del dueño | Claude | hecho (#64) |

Cierre de implementación: PRs #74, #76 y #75 mergeados. La decisión de conservación y la puesta en operación de SD-412
siguen abiertas en el roadmap; el cierre del lote no acredita una prueba de la demo por el dueño.

## Lote 2 · Saywa Lodges en producción con huéspedes reales (listo para revisar)

Objetivo: la primera reserva real pagada por el sistema. Es lo que valida el producto antes de venderlo.

| Ticket | Qué | Quién | Estado |
|---|---|---|---|
| SD-902 | Ordenar el roadmap: cerrar los `[~]` que ya cumplen, mover sobrantes a tickets nuevos | Codex | hecho (#77) |
| SD-409 | Anti-abuso: límite por origen, BotID/captcha en cotizar, reservar y subir comprobante | Claude | hecho (#78); BotID/captcha pendiente si hay abuso real |
| SD-413 | Reserva manual, pago de saldo, *snapshot* del huésped, aprobar/cancelar solo el dueño | Claude | hecho (#80, #81, #82, #83) |
| SD-701 | CSP y cabeceras de seguridad | Codex (+ revisión de seguridad) | implementado (ADR 0011); falta verificar en preview (ver `docs/produccion.md`) |
| SD-702 | Checklist de producción (backups probados, dominios, cron, monitoreo activo) | Claude + dueño | hecho (#79); el dueño ejecuta el checklist por instalación |

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

## Lote 5 · Producto listo para vender e instalar

Objetivo: que cada instalación arranque con los datos del cliente y se maneje cómodo desde el celular.

| Ticket | Qué | Quién | Estado |
|---|---|---|---|
| SD-420 | Asistente de importación único (unidades, tarifas, huéspedes, reservas, gastos) y edición rápida | Claude (RPC) + Codex (pantallas) | en curso: casas y tarifas base hechas (#96, #97); faltan gastos/ingresos, huéspedes y reservas directas (SD-601) y edición rápida |
| SD-421 | Calendario estilo Airbnb, adaptable a móvil, con precios por noche y acciones por rango | Codex (+ revisión de Claude) | en curso: calendario móvil (#95) y precio por noche visible (#98); falta cambiar precio por rango (tabla + RPC) y reutilizarlo en el sitio público |

| SD-211 | Unidades visibles en la web: tarjetas, página por casa, fotos y espacios por unidad, áreas comunes | Claude (BD) + Codex (web y panel) | pendiente |
| SD-212 | Villa completa = Casa 1 + Casa 2, sin doble reserva | Claude | pendiente |
| SD-213 | Fechas especiales en la web (Año Nuevo, Semana Santa, feriados) | Claude (BD) + Codex (web) | pendiente; después del precio por rango |

Orden: precio por rango (SD-421) → SD-211 → SD-212 → SD-213. Se suman a este lote SD-307 (sincronización iCal automática) y SD-807 (ingresos automáticos), ambos de Claude.

## Lotes 6 a 10 · Comercialización

Plan y motivos del orden: [`plan-comercial.md`](plan-comercial.md). El lote 3 queda repartido entre los lotes 6, 8 y 9.

| Lote | Objetivo | Tickets | Quién |
|---|---|---|---|
| 6 | Vendible tal cual | SD-1101, SD-1102, SD-1103, SD-903, SD-1107 | Claude (1101, 1103, 903), Codex (1102, 1107) |
| 7 | Demo y web de ventas | SD-1007, SD-1104, SD-1110, SD-1111, SD-1112 | Codex; Claude revisa 1110 (`proxy.ts`) |
| 8 | WhatsApp automático | SD-1009, SD-1010, SD-1011, SD-1012 | Claude (1010, 1012), Codex (1009, 1011) |
| 9 | Entrega al cliente | SD-1105, SD-1106, SD-1108, SD-605, SD-606 | Claude (1108, 605), Codex (1105, 1106, 606) |
| 10 | CRM y portafolio | SD-601, SD-602, SD-904, SD-703 | Claude (601, 602), Codex (904, 703) |

El lote 4 (Mercado Pago) va entre el 9 y el 10.

## Después (sin lote)

| Ticket | Qué | Quién | Estado |
|---|---|---|---|
| PP-10 | PDF de guía y contraseñas memorables | Codex | mergeado (#85) |
| PP-11 | PDF desde el editor, impresión sin página vacía, referencias de fotos, texto WhatsApp y mensaje personalizado | Codex | completado (#86) |
| SD-419 | Importar historial CSV de Airbnb en Finanzas | Claude (partes 1–3), Codex (parte 4) | hecho (#88, #90; neto #91)|

SD-1006 (web de ventas, necesita precio aprobado), SD-601 y SD-602 (CRM y check-in), SD-807 (ingresos
automáticos), SD-307 (sincronización iCal programada), SD-703 (portafolio), SD-1001 pendiente (`siteOrigin`),
SD-108 (límites/privilegios en BD), SD-414 (FK de reservas),
SD-419 (importar historial Airbnb, ver roadmap), SD-415 (concurrencia en CI), SD-416 (comprobante purgado) SD-417 (borrado de aprobados tras decidir el plazo) y SD-418 (aviso de revisión demorada).

## Mantenimiento semanal (lunes, automático)

- Dependabot abre PRs de dependencias (`risk:high`): Claude los revisa y mergea en una pasada.
- `Installation health` vigila las instalaciones y avisa por email si algo falla.
- El coordinador limpia worktrees y ramas locales ya mergeadas.
