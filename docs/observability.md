# Observabilidad: logs estructurados y alertas (SD-606)

## Logs estructurados
`lib/log.ts` escribe **una línea JSON por evento** en stdout/stderr, que Vercel Logs ya recoge (sin proveedor
externo ni coste). Es seguro por construcción: un log solo puede llevar los campos de una **lista cerrada**
(`requestId`, `route`, `method`, `status`, `outcome`, `code`, `errorName`, `digest`, `routeType`, `count`,
`durationMs`) y cada valor debe cumplir un patrón corto y estricto; si no, se descarta. Texto libre no entra:
nunca `error.message`, URLs con tokens, cabeceras, cuerpos, emails, datos de huéspedes ni claves.
Para registrar algo nuevo hay que añadirlo a `FIELDS` a propósito (y a sus tests).

- `requestId`: UUID generado en el servidor por petición (nunca tomado del cliente); las rutas cron lo devuelven
  también en la cabecera `x-request-id` para correlacionar.
- `errorName`: solo el nombre de la clase del error (`TypeError`), jamás el mensaje.
- `instrumentation.ts` (`onRequestError`, mecanismo gratuito de Next) registra los errores no capturados como
  `request.unhandled_error` con el **patrón** de ruta (`/api/ical/[token]`), no con `request.path`.

## Eventos del cron `expire-holds`
| Evento | Nivel | Significado |
|---|---|---|
| `cron.expire_holds.unauthorized` | warn | 401: secreto ausente/incorrecto (no se ejecuta nada) |
| `cron.expire_holds.completed` | info | 200, con `count` de holds liberados |
| `cron.expire_holds.failed` | error | 500 genérico al cliente |
| `cron.expire_holds.rpc_failed` / `bad_result` | error | causa en el DAL (`code` = SQLSTATE) |
| `ical.export.failed` | error | 500 del export iCal |

No existen rutas de webhook todavía (llegan con los pagos); cuando se creen deben usar `lib/log.ts` con el
mismo patrón (`<area>.<job>.unauthorized|completed|failed`).

## Alertas — estado
- **Hecho (gratis, en el repo):** eventos `level: "error"` consultables en Vercel → Logs filtrando por
  `cron.expire_holds.failed` o `level:error`.
- **Pendiente del dueño (no completo):** una alerta *remota* (correo/Slack) requiere configurar un servicio
  externo que el agente no puede ni debe configurar. Opciones sin coste:
  1. **GitHub Actions** como programador del cron (ver `docs/cron.md`): `curl -fsS` falla con 401/5xx, la ejecución
     fallida notifica por correo al dueño del repo (Settings → Notifications → Actions).
  2. **cron-job.org**: activar «notificar en caso de fallo» en el job.
  3. Alerta de Vercel (Observability → Alerts) o un Log Drain: depende del plan y de un destino externo.
  Hasta que el dueño elija y configure una, el criterio «alerta de fallo cron/webhook» **no está cumplido**.
