# Cron de expiración de holds (SD-408)

Ruta: `GET` o `POST /api/cron/expire-holds` en el dominio de plataforma (`ROOT_DOMAIN`, no en un sitio de tenant).
Ejecuta `expire_holds()` con la service-role. Es idempotente: ejecutarla dos veces seguidas no hace daño.

## Seguridad
- Exige `Authorization: Bearer <CRON_SECRET>`. Sin cabecera, con valor incorrecto o con `CRON_SECRET`
  sin configurar (o de menos de 32 caracteres) responde `401` vacío y **no ejecuta nada**.
- La comparación es en tiempo constante (hash SHA-256 de ambos lados + `timingSafeEqual`).
- Un fallo interno responde `500 {"error":"internal"}`; el detalle queda solo en el log del servidor.
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

# Página pública de estado

`/[lang]/reserva/[public_token]` en el host del tenant (`saywa-lodges.localhost:3000/es/reserva/<token>`).
El `public_token` (64 hex, columna `bookings.public_token`, inmutable) es la credencial del huésped. La lectura pasa
solo por la RPC `get_booking_status(host, token)`: `anon` no tiene SELECT sobre `bookings`; la RPC exige que la
propiedad esté publicada y que el host coincida con su subdominio/dominio propio, y no devuelve datos personales.
Token inválido, de otro tenant o de propiedad no publicada → el mismo 404. Aún no hay quien entregue el enlace
al huésped: lo hará el flujo de reserva (SD-403/405), que deberá devolver `public_token` al crear el booking.
