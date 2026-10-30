# ADR 0008 · Ingresos automáticos desde reservas y calendario

- Estado: aceptado (SD-807) · Fecha: 2026-10-30

## Contexto

ADR 0007 dejó `finance_entries` listo para cargas de confianza (`source`, `external_ref` único por organización).
SD-401 aprueba pagos de reservas directas y SD-305 importa estadías de Airbnb/Booking, pero un feed iCal solo trae fechas.

## Decisión

- **Reserva directa**: `confirm_payment` registra el ingreso de *ese* pago en la misma transacción que lo aprueba
  (`source = booking`, `external_ref` = id del pago). Un reintento sale antes de tocar el libro y el índice único es la
  última barrera, así que un pago no puede producir dos ingresos aunque haya concurrencia.
  - El monto es el pago aprobado, no el total de la reserva; la fecha de cobro es el día en Lima del registro del pago.
  - `created_by` queda nulo: es un movimiento del sistema y el personal que aprueba no gana acceso a filas del libro que no escribió.
  - Moneda: sin fuente externa de tipo de cambio (ADR 0007), se usa el que reciba la función o el último de la organización
    para esa moneda; sin ninguno se rechaza con `22023` antes de cambiar nada.
  - Cancelar una reserva confirmada conserva el ingreso: los reembolsos no están modelados y el dinero se recibió.
- **iCal**: nunca se crea un ingreso automáticamente ni se infiere un importe. Las estadías importadas (Airbnb/Booking, ya
  iniciadas) sin ingreso se listan en «Alquileres por completar»; solo el dueño las completa con el monto que escribe, y
  opcionalmente el costo de limpieza sugerido por casa. La clave `ical:<sha256(feed + uid hasheado)>` se deriva en la base de
  datos, es estable ante re-sincronizaciones (incluso si el evento cambia de fechas) y no se entrega al cliente.
  Una estadía ya cargada a mano con las mismas fechas en la misma casa cuenta como completada.
- **Ocupación**: las noches con bloqueo manual del dueño se descuentan de las disponibles. Los bloqueos de reserva e iCal no:
  esas noches están vendidas, no fuera de venta.

## Consecuencias

- Los bloqueos de canal que no son reservas (p. ej. «Not available» de Airbnb) quedan en la lista hasta que exista una forma de
  descartarlos: propuesta de ticket.
- Si una reserva admitiera pagos posteriores al depósito, cada pago aprobado generaría su propio ingreso con la misma estadía;
  el reporte «por estadía» tendría que agrupar por reserva. Hoy solo el primer pago confirma la reserva.
