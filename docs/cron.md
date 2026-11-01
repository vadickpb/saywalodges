# Cron de expiración de holds (SD-408)

Ruta: `GET` o `POST /api/cron/expire-holds` en el dominio de plataforma (`ROOT_DOMAIN`, no en un sitio de tenant).
**En modo instalación** (`DEPLOYMENT_MODE=installation`, ADR 0010) la ruta vive en `app.<ROOT_DOMAIN>`: el dominio raíz es
el sitio del cliente y responde 404 a cualquier `/api/*`. Los ejemplos de abajo con `https://<ROOT_DOMAIN>/api/...` deben
usar `https://app.<ROOT_DOMAIN>/api/...` en ese modo.
Ejecuta `expire_holds()` con la service-role. Es idempotente: ejecutarla dos veces seguidas no hace daño.

## Seguridad
- Exige `Authorization: Bearer <CRON_SECRET>`. Sin cabecera, con valor incorrecto o con `CRON_SECRET`
  sin configurar (o de menos de 32 caracteres) responde `401` vacío y **no ejecuta nada**.
- La comparación es en tiempo constante (hash SHA-256 de ambos lados + `timingSafeEqual`).
- Un fallo interno responde `500 {"error":"internal"}`; el detalle queda solo en el log del servidor.
- Cada llamada deja una línea de log estructurada sin datos sensibles y devuelve `x-request-id` (ver `docs/observability.md`).
- Respuesta correcta: `200 {"expired": N}` (N = holds liberados). Siempre `Cache-Control: no-store`.

## Qué libera
Reservas `pending_payment` con `expires_at <= now()` pasan a `expired` y se borra su bloque de calendario
(las fechas vuelven a estar libres). Las que tienen un comprobante en revisión **no** se expiran: decide el dueño.
Mientras el job no corre, la página de estado ya muestra «retención vencida» (`hold_lapsed`), y
`create_booking_from_quote` libera los holds vencidos de esa unidad antes de reservar, así que un retraso del
cron nunca bloquea fechas.

## Pasos manuales del dueño (no hechos por el agente)
1. Generar el secreto: `openssl rand -hex 32`.
2. Guardarlo como `CRON_SECRET` en Vercel (Settings → Environment Variables) — o en `.env.local` en local.
3. Programar la llamada **sin plan de pago**. Este repo no define `crons` en Vercel (el plan Hobby solo permite
   ejecuciones diarias). Opciones gratuitas:
   - **GitHub Actions** (`schedule: cron: "*/15 * * * *"`) con un paso
     `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<ROOT_DOMAIN>/api/cron/expire-holds`
     y el secreto guardado en *Secrets* del repositorio.
   - **cron-job.org** (u otro servicio gratuito): URL de la ruta, método POST, cabecera `Authorization: Bearer <secreto>`,
     cada 5–15 minutos.
   - **Supabase pg_cron**: puede llamar `public.expire_holds()` directamente en la BD (sin HTTP). Requiere
     habilitar la extensión desde el panel de Supabase.
4. Con un intervalo de 15 min, un hold vence como mucho 15 min después de su `expires_at`; el mínimo de
   `booking_hold_minutes` es 15.

## Probar en local
```bash
CRON_SECRET=$(openssl rand -hex 32) npm run dev
curl -i -X POST http://localhost:3000/api/cron/expire-holds                                   # 401
curl -i -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/expire-holds  # 200
```

# Cron de sincronización iCal y alertas (SD-307)

Ruta: `GET` o `POST /api/cron/ical-sync` (dominio de plataforma). Misma autenticación que `expire-holds`:
`Authorization: Bearer <CRON_SECRET>`; sin secreto, con uno incorrecto o con `CRON_SECRET` sin configurar
(< 32 caracteres) responde `401` vacío y no ejecuta nada. Reutiliza `CRON_SECRET`; no añade variables.

## Qué hace en cada ejecución
- Pide a la BD hasta **25 feeds** con `import_url` cuyo último intento sea > 10 min (los más antiguos primero, así que
  los que fallan no matan de hambre a los demás), los procesa **5 en paralelo** y no empieza otro grupo pasados ~45 s
  (`maxDuration = 60`); lo que quede se atiende en la siguiente ejecución. Responde `200` con un resumen de contadores
  (`due`, `synced`, `failed`, `skipped`, `deferred`, `alerts*`), sin URLs ni datos de reservas.
- **Aislamiento**: cada feed es su propio dominio de fallo; uno que falla (URL no permitida, red, tamaño, formato) queda
  registrado solo en ese feed (`last_error` con código cerrado) y los demás siguen.
- **Seguridad de la descarga**: es el mismo importador que el botón manual (allowlist de hosts, bloqueo de IP privadas/DNS,
  límite de tamaño y de tiempo). Semántica de datos idéntica a SD-305: instantánea validada completa o nada, lease de 2 min
  (`sync_token`), cierre obsoleto rechazado si cambió la URL, los conflictos no sobrescriben reservas.
- **Base de datos**: las RPC de SD-305 (`begin/finish_ical_sync`) siguen siendo solo para el owner. El cron usa
  `cron_list_due_ical_feeds`, `cron_begin_ical_sync`, `cron_finish_ical_sync`, `cron_claim_ical_alert` y
  `cron_settle_ical_alert`, **ejecutables solo por `service_role`** (anon/authenticated sin permiso). Reciben solo el id del
  feed: la organización la deriva la BD de la fila del feed, nunca el llamador. Ejecutan el mismo núcleo privado que las
  RPC del owner, sin saltar el lease.
- **Reintentos/solapes**: una segunda ejecución simultánea no toma el lease (`skipped`) y un feed intentado hace < 10 min no
  vuelve a ser elegible.

## Alertas al owner (correo)
- **Conflicto nuevo**: un evento importado que choca con fechas ocupadas. **Feed caído**: fallos continuos desde hace
  > 24 h (`ical_feeds.failing_since`, se limpia con la primera sincronización correcta).
- Destinatarios: usuarios con rol `owner` de la organización del feed. El correo solo lleva canal, nombre de la casa y
  cuántos conflictos nuevos; ni fechas, ni UIDs, ni URLs de feeds, ni datos de huéspedes. Los logs no llevan destinatarios.
- **Sin duplicados (persistente)**: tabla `ical_alerts` (única por feed + tipo + clave: hash del conflicto o inicio del
  corte). Se reclama de forma atómica antes de enviar; entrega real → queda cerrada; fallo → se libera y se reintenta en la
  próxima ejecución; un reclamo abandonado se recupera a los 10 min. Un conflicto que se vuelve a crear en cada sync no
  vuelve a alertar; un corte nuevo (otra racha de fallos) sí.
- **Modo simulación** (`lib/email`, sin `RESEND_API_KEY` fuera de producción): se renderiza y se registra `email.simulated`
  pero **no se marca como enviada**, así que cuando el correo se configure las alertas pendientes salen. Consecuencia: en
  simulación se repite el log cada ejecución mientras exista el conflicto. En producción sin clave, `not_configured` se cuenta
  en `alertsFailed` y también se reintenta.
- Idioma: español (aún no hay preferencia de idioma por usuario).

## Pasos manuales del dueño (no hechos por el agente)
1. `CRON_SECRET` configurado (ver arriba).
2. **Programar** la llamada cada 15 min: el repo **no** define `crons` en Vercel (Hobby solo permite ejecuciones diarias; cada
   15 min exige Pro). Opciones gratuitas: GitHub Actions (`*/15 * * * *` con
   `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<ROOT_DOMAIN>/api/cron/ical-sync`), cron-job.org, o
   Vercel Cron Pro si el dueño decide pagarlo. Hasta que se programe, **no hay sincronización automática** y el criterio
   «cada 15 min» no está cumplido.
3. Aplicar la migración `20261030120000_ical_cron_sync.sql` en la BD remota **antes** de desplegar/programar el cron
   (crea columnas `last_attempt_at`/`failing_since`, la tabla `ical_alerts` y las RPC `cron_*`; reemplaza `begin/finish_ical_sync`
   por envoltorios del mismo contrato).
4. Para entregar correos reales: dominio verificado y `RESEND_API_KEY` (SD-306, pendiente del dueño).
5. Alerta externa de fallo del propio cron (200/401/500): ver `docs/observability.md`.

## Probar en local
```bash
CRON_SECRET=$(openssl rand -hex 32) npm run dev
curl -i -X POST http://localhost:3000/api/cron/ical-sync                                        # 401
curl -i -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/ical-sync  # 200 {summary}
```

# Página pública de estado

`/[lang]/reserva/[public_token]` en el host del tenant (`saywa-lodges.localhost:3000/es/reserva/<token>`).
El `public_token` (64 hex, columna `bookings.public_token`, inmutable) es la credencial del huésped. La lectura pasa
solo por la RPC `get_booking_status(host, token)`: `anon` no tiene SELECT sobre `bookings`; la RPC exige que la
propiedad esté publicada y que el host coincida con su subdominio/dominio propio, y no devuelve datos personales.
Token inválido, de otro tenant o de propiedad no publicada → el mismo 404. Aún no hay quien entregue el enlace
al huésped: lo hará el flujo de reserva (SD-403/405), que deberá devolver `public_token` al crear el booking.
