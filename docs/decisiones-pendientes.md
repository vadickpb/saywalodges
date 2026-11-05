# Decisiones pendientes del dueño

Aquí se acumulan las decisiones de negocio que los agentes **no** pueden tomar. Ningún agente interrumpe un
ticket para preguntarlas: asume la opción recomendada si es reversible, o deja el ticket bloqueado y sigue con
otro. El dueño responde cuando quiera (basta escribir «D3: sí»). Al decidir, se mueve la fila a «Decididas».

## Abiertas

| Id | Decisión | Recomendación | Bloquea |
|---|---|---|---|
| D1 | Texto legal real de las condiciones de reserva (`dictionaries/checkout-policies.ts`, marcado `TODO(owner)`) | Escribirlo tú o con un abogado; no se puede inventar | Compartir enlaces reales (lote 2) |
| D2 | Permisos del staff: ¿aprobar pagos y cancelar reservas solo el dueño? | Sí, solo el dueño | SD-413 (se asume «sí») |
| D3 | Plazo de conservación de comprobantes aprobados | 5 años propuestos; validar finalidad y obligaciones contables. La Ley 29733 no fija ese plazo (`docs/cron.md`, SD-412) | Habilitar su borrado en un ticket posterior; el cron SD-412 siempre protege aprobados |
| D4 | Precio de instalación y de mantenimiento mensual | Fijarlo con los costos por cliente (Supabase Pro + Vercel Pro + dominio) | SD-1006 |
| D5 | Iniciar la verificación del negocio en Meta (WhatsApp Cloud API) | Empezar ya: tarda semanas y no depende del código (`docs/whatsapp.md`) | SD-1009 |

## Decididas

| Id | Decisión | Respuesta | Fecha |
|---|---|---|---|
| D0 | ¿Caduca una reserva con comprobante sin revisar? | No caduca; el tope de 3 reservas pendientes por unidad y el aviso al dueño (SD-407) acotan el abuso | 2026-11-03 |
