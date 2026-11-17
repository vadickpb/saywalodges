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
| D5 | Iniciar la verificación del negocio en Meta (WhatsApp Cloud API) | Empezar ya: tarda semanas y no depende del código (`docs/whatsapp.md`) | SD-1009 |
| D8 | Dominio de la web de ventas | `hoststay.com` no está disponible (aparcado por un tercero). Recomendado `hoststay.app` (USD 9,99 el primer año, USD 15 de renovación) en proyecto Vercel propio, modo `vendor`. Falta comprarlo | SD-1110 |
| D9 | Licencia y visibilidad del repositorio | **Asumida** la recomendación en SD-1107 (`LICENSE` propietaria, código visible). Cambia el nombre del titular en `LICENSE` si no es el correcto | — |
| D10 | Paquetes de venta y módulos de cada uno | Base (web, calendario, reservas) y Pro (+ finanzas, WhatsApp, pago en línea) | SD-1111 |
| D11 | Herramienta de publicación en redes y cuentas (Facebook, Instagram profesional, TikTok empresa, Google Business Profile) | Metricool (o Buffer) para programar; el sistema solo genera y mide, no publica | SD-1203 |

## Decididas

| Id | Decisión | Respuesta | Fecha |
|---|---|---|---|
| D0 | ¿Caduca una reserva con comprobante sin revisar? | No caduca; el tope de 3 reservas pendientes por unidad y el aviso al dueño (SD-407) acotan el abuso | 2026-11-03 |
| D4 | Precio de instalación y de mantenimiento mensual | **Por proforma, no se publica.** La web de ventas muestra paquetes por funciones y un botón «Solicitar proforma»; el dueño envía la proforma a cada cliente | 2026-11-17 |
| D7 | Nombre comercial del producto | **HostStay** («Solución integral para anfitriones»). «Saywa Lodges» queda como alojamiento y caso de éxito. Pendiente del dueño: revisar marca en INDECOPI | 2026-11-17 |
