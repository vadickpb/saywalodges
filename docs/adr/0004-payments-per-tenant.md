# ADR 0004 · Pagos directos al tenant, manual + Mercado Pago

- Estado: aceptado · Fecha: 2026-09-23

## Contexto
En Perú la mayoría de adelantos se pagan por Yape/Plin/transferencia. La propuesta de valor es
"sin comisión de Saywa": Saywa no debe custodiar dinero de huéspedes.

## Decisión
- Interfaz `PaymentProvider` (`createCheckout`, `handleWebhook`) en `lib/payments/`.
- **Manual** (primero): el huésped sube un voucher a un bucket privado; el dueño aprueba.
- **Mercado Pago Checkout Pro** (después): credenciales por tenant cifradas (Supabase Vault);
  el dinero va a la cuenta del dueño.
- Webhooks: firma verificada, idempotencia por `event_id`, reconsulta del pago a la API.
- Montos siempre calculados en servidor, en céntimos.

## Consecuencias
- Saywa no es agente de pagos (menor carga regulatoria).
- No hay ingresos por transacción; el modelo es suscripción.
- Añadir otra pasarela (Izipay, Culqi) es implementar la interfaz.
