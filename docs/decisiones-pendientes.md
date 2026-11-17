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
| D7 | Nombre comercial del producto | Mantener «Saywa Direct»; «Saywa Lodges» queda solo como alojamiento y caso de éxito | SD-1110 |
| D8 | Dónde vive la web de ventas y con qué dominio | Mismo repositorio en modo `vendor`, proyecto Vercel y dominio propios | SD-1110 |
| D9 | Licencia y visibilidad del repositorio | **Asumida** la recomendación en SD-1107 (`LICENSE` propietaria, código visible). Cambia el nombre del titular en `LICENSE` si no es el correcto | — |
| D10 | Paquetes de venta y módulos de cada uno | Base (web, calendario, reservas) y Pro (+ finanzas, WhatsApp, pago en línea) | SD-1111 |
| D11 | Herramienta de publicación en redes y cuentas (Facebook, Instagram profesional, TikTok empresa, Google Business Profile) | Metricool (o Buffer) para programar; el sistema solo genera y mide, no publica | SD-1203 |

## Decididas

| Id | Decisión | Respuesta | Fecha |
|---|---|---|---|
| D0 | ¿Caduca una reserva con comprobante sin revisar? | No caduca; el tope de 3 reservas pendientes por unidad y el aviso al dueño (SD-407) acotan el abuso | 2026-11-03 |
