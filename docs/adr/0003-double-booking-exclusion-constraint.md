# ADR 0003 · Prevención de doble reserva con exclusion constraint

- Estado: aceptado · Fecha: 2026-09-23

## Contexto
Las fechas se ocupan desde varias fuentes: reservas directas, holds de pago pendiente,
bloqueos manuales e iCal de Airbnb/Booking. Chequear disponibilidad en la app y luego insertar
tiene condiciones de carrera.

## Decisión
Tabla única `calendar_blocks (unit_id, period daterange '[)', source, …)` con
`EXCLUDE USING gist (unit_id WITH =, period WITH &&)` (extensión `btree_gist`).
Toda ocupación, incluidos los holds con `expires_at`, es un bloque. Los holds vencidos se liberan
por cron y al inicio de `create_booking_from_quote`.
Si un bloque importado por iCal choca, se registra en `sync_conflicts` y se alerta al dueño.

## Consecuencias
- Garantía a nivel de BD, incluso con peticiones concurrentes.
- Check-out y check-in el mismo día no solapan (rango semiabierto).
- La app no reimplementa la verificación; solo traduce el error a un mensaje claro.
