# WhatsApp Business Cloud API (SD-1008)

Cada instalación tiene **su propio número** y sus propias credenciales (ADR 0010). Este ticket entrega el **cliente** (`lib/whatsapp/`) y el
**webhook** que registra el estado de entrega. Las plantillas de reserva y el consentimiento del huésped llegan en SD-1009: hasta
entonces nada llama al cliente en producción.

## Qué hace
- `sendWhatsappTemplate()` (`lib/whatsapp/send.ts`): envía una **plantilla aprobada por Meta** (no texto libre) a `POST https://graph.facebook.com/<versión>/<phone-number-id>/messages`.
  - **Sin reintento automático**: la API no tiene clave de idempotencia; reintentar tras un timeout podría escribirle dos veces al huésped.
    Si el resultado es incierto devuelve `unavailable` y decide quien llama.
  - **Consentimiento**: la función exige `optIn: true`, pero **no** comprueba que exista. Quien la llame debe tener el opt-in del huésped (SD-1009).
  - **No se guarda el teléfono**: el registro (`whatsapp_messages`) solo tiene el id de Meta (`wamid`), la plantilla, el idioma, la reserva opcional y el estado.
  - Modo simulación (sin credenciales fuera de producción): no sale nada a Meta; se registra el envío con un id `sim_…`.
  - En producción sin credenciales, o en `simulate`, **se niega a enviar** (no finge).
- Webhook `/api/whatsapp/webhook` (en `app.<dominio>`):
  - `GET`: el *handshake* de Meta. Responde el desafío solo si el token coincide (comparación en tiempo constante); si no, `403`.
  - `POST`: **toda** petición debe traer `X-Hub-Signature-256` válida sobre el cuerpo crudo; si no, `401` vacío y no se procesa nada.
    Registra los estados `sent → delivered → read` / `failed`. El estado **solo avanza**: un evento duplicado o tardío no cambia nada
    (Meta reenvía y desordena). Si la base falla responde `500` a propósito para que Meta reintente (es seguro: es idempotente).
  - Los mensajes **entrantes** del huésped no se procesan ni se guardan.

## Variables (por instalación; `.env.example`)
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` (todas sensibles salvo el id), y opcionales
`WHATSAPP_MODE`, `WHATSAPP_API_VERSION` (por defecto `v21.0`: **verifica en Meta cuál está vigente** antes del primer envío real).

## Trámite con Meta (lo haces tú, por cliente; tarda días)
1. <https://business.facebook.com> → crea o usa el **Business portfolio** del cliente (a su nombre) y completa la **verificación del negocio**
   (documentos legales del cliente). Sin ella el límite de mensajes es mínimo.
2. <https://developers.facebook.com> → **Create App** (tipo *Business*) → añade el producto **WhatsApp**.
3. **WhatsApp → API Setup**: añade el **número** del cliente (debe poder recibir un SMS o llamada de verificación y **no** estar ya en la app de WhatsApp).
   Copia el **Phone number ID**.
4. **Token permanente**: Business Settings → Users → **System Users** → crea uno (rol *Admin*), asígnale la app y el activo de WhatsApp y
   genera un token con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`. Cópialo (solo se muestra una vez).
5. **App secret**: App settings → Basic → *App secret* → **Show**.
6. **Webhook**: WhatsApp → Configuration → *Webhook* → **Edit**: URL `https://app.<dominio>/api/whatsapp/webhook` y *Verify token* = el valor de
   `WHATSAPP_VERIFY_TOKEN` (ya cargado en Vercel y redesplegado **antes**, porque Meta hace el GET en ese momento). Después suscríbete al campo **messages**.
7. **Plantillas**: WhatsApp → Message templates → créalas y espera la aprobación (SD-1009 define cuáles).

## Probar sin gastar mensajes
- Local: sin variables, el cliente simula. Para el webhook, exporta `WHATSAPP_APP_SECRET` y `WHATSAPP_VERIFY_TOKEN` y firma tus propias peticiones
  (`printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WHATSAPP_APP_SECRET"`).
- Meta ofrece un **número de prueba** gratuito en API Setup: úsalo antes de conectar el número real.

## Límites conocidos
- La versión de la Graph API y los códigos de error de Meta cambian con el tiempo; el cliente solo conserva el código numérico en los logs.
- Nada impide hoy que un desarrollador llame a `sendWhatsappTemplate` sin consentimiento real (solo el tipo `optIn: true`); SD-1009 añade el registro de opt-in
  y la comprobación.
