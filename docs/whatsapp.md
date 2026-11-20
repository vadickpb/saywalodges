# WhatsApp Business Cloud API (SD-1008)

Cada instalación tiene **su propio número** y sus propias credenciales (ADR 0010). Este ticket entrega el **cliente** (`lib/whatsapp/`) y el
**webhook** que registra el estado de entrega. SD-1009 añade las plantillas de reserva, el consentimiento (opt-in) del huésped y el
envío programado: ver «Mensajes de la reserva (SD-1009)» más abajo.

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
`WHATSAPP_API_VERSION` (**obligatoria para enviar de verdad**, p. ej. `v23.0`; no hay valor por defecto porque Meta retira versiones: consulta la vigente en el *changelog* de la Graph API) y, opcional, `WHATSAPP_MODE`.

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
7. Para recibir webhooks de números **reales** la app de Meta debe estar en modo **Live** (App settings → arriba, interruptor *App Mode*); con números de prueba basta el modo desarrollo.
8. **Plantillas**: WhatsApp → Message templates → créalas con el texto exacto de «Plantillas a crear en Meta» y espera la aprobación.

## Mensajes de la reserva (SD-1009)

### Qué se envía y cuándo
Cuatro mensajes, todos con **plantilla aprobada**, en el idioma de la reserva (`es`/`en`), solo si el huésped marcó la casilla de WhatsApp al reservar:

| Mensaje | Plantilla | Cuándo |
|---|---|---|
| Confirmación | `booking_confirmation` | La reserva pasa a confirmada (en las últimas 48 h: una caída larga no manda noticias viejas) |
| Recordatorio del adelanto | `deposit_reminder` | Pendiente de pago, sin comprobante en revisión ni aprobado, y queda un tercio (o menos) de la retención (más de 5 min) |
| Recordatorio de llegada | `arrival_reminder` | Reserva confirmada, desde `WHATSAPP_ARRIVAL_DAYS` días antes (por defecto 1) hasta la llegada |
| Post-estadía | `post_stay` | Reserva confirmada, desde las 14:00 (Lima) del día de salida y hasta 3 días después |

Una fila por reserva y tipo (`whatsapp_outbox`, `unique(booking_id, kind)`): ejecutar el programador dos veces no manda nada dos veces.
**Como máximo una vez**: el envío se reclama antes de hablar con Meta y nunca se reintenta (la API no tiene clave de idempotencia; un duplicado es peor que un
recordatorio perdido). Un reclamo abandonado más de 30 min se cierra como `failed`. Las reglas configurables por el dueño y el horario permitido llegan en SD-1010.

### Consentimiento (opt-in)
- En el checkout hay una casilla **separada de los términos**, opcional y **nunca marcada por defecto**. Sin ella no se encola ni se envía nada.
- Exige un teléfono que WhatsApp pueda alcanzar: móvil peruano de 9 dígitos, o con `+código` de país. Si no, el formulario lo rechaza (no se adivina el número).
- Evidencia (`whatsapp_optins`, solo el servidor la lee): fecha, texto exacto mostrado, versión (`WHATSAPP_OPTIN_VERSION`, hoy `v1`) e idioma. El texto sale del diccionario
  del servidor, nunca del formulario. Si el texto cambia hay que subir la versión.
- No es el consentimiento de marketing (SD-602): esos mensajes no existen aquí, solo transaccionales sobre esa reserva.
- Una repetición del envío del formulario no cambia el consentimiento: decide la primera.
- El teléfono es el que el huésped escribió en esa reserva (`bookings.guest_phone`); no se copia a ninguna tabla nueva.
- Retirar el consentimiento: `whatsapp_optins.revoked_at` (el programador lo respeta en el acto). La respuesta «BAJA» del huésped la procesa SD-1012; hasta entonces el
  huésped avisa al alojamiento (lo dice el texto de la casilla).
- Límite conocido: el checkout es público, así que alguien podría marcar la casilla con el número de otra persona. Se mitiga porque solo se envían mensajes
  de esa reserva (plantillas transaccionales, máx. 4) y WhatsApp deja bloquear al remitente. Es un riesgo aceptado y documentado; el texto legal lo valida el dueño (D12).

### Plantillas a crear en Meta (lo haces tú, por cliente)
WhatsApp Manager (<https://business.facebook.com/wa/manage/message-templates>) → **Create template**. Para cada una: **Category = Utility**, nombre **exacto**
(minúsculas y guion bajo), idioma, **Body** con el texto de abajo copiado sin cambios (las variables `{{1}}`, `{{2}}`… tal cual) y los ejemplos que pide Meta.
Sin encabezado, pie ni botones. Crea **ambos idiomas** de cada nombre. La aprobación suele tardar de minutos a un día; si Meta reclasifica una plantilla a
*Marketing* o la rechaza, avisa al agente con el motivo (no cambies el texto a mano: los textos viven en `lib/domain/whatsapp-templates.ts` y un test los
compara con este documento).

#### `booking_confirmation` — se envía cuando la reserva pasa a confirmada (pago aprobado)

- Categoría: **Utility** (no Marketing). Idiomas: **Spanish (es)** y **English (en)** con el mismo nombre. Sin encabezado, pie ni botones.
- Variables: {{1}} = nombre del huésped; {{2}} = alojamiento; {{3}} = fecha de llegada; {{4}} = fecha de salida.
- Texto Spanish (es) (copia exacta):

  ```text
  Hola {{1}}, tu reserva en {{2}} está confirmada. Llegada: {{3}}. Salida: {{4}}. Si necesitas algo, responde a este mensaje.
  ```

  Ejemplos que Meta pide para las variables: {{1}} = `Ana`, {{2}} = `Casa 1`, {{3}} = `21 dic 2026`, {{4}} = `24 dic 2026`

- Texto English (en) (copia exacta):

  ```text
  Hi {{1}}, your booking at {{2}} is confirmed. Check-in: {{3}}. Check-out: {{4}}. If you need anything, reply to this message.
  ```

  Ejemplos que Meta pide para las variables: {{1}} = `Ana`, {{2}} = `House 1`, {{3}} = `Dec 21, 2026`, {{4}} = `Dec 24, 2026`

#### `deposit_reminder` — se envía cuando queda un tercio de la retención sin comprobante en revisión

- Categoría: **Utility** (no Marketing). Idiomas: **Spanish (es)** y **English (en)** con el mismo nombre. Sin encabezado, pie ni botones.
- Variables: {{1}} = nombre; {{2}} = alojamiento; {{3}} = monto del adelanto; {{4}} = fecha y hora límite (Lima).
- Texto Spanish (es) (copia exacta):

  ```text
  Hola {{1}}, tu reserva en {{2}} sigue pendiente de pago. Para confirmarla, paga el adelanto de {{3}} antes de {{4}} (hora de Lima) y sube tu comprobante desde el enlace de tu reserva. Después de esa hora las fechas se liberan.
  ```

  Ejemplos que Meta pide para las variables: {{1}} = `Ana`, {{2}} = `Casa 1`, {{3}} = `S/ 300.00`, {{4}} = `20 dic 2026, 18:30`

- Texto English (en) (copia exacta):

  ```text
  Hi {{1}}, your booking at {{2}} is still waiting for payment. To confirm it, pay the deposit of {{3}} before {{4}} (Lima time) and upload your proof of payment from your booking link. After that time the dates are released.
  ```

  Ejemplos que Meta pide para las variables: {{1}} = `Ana`, {{2}} = `House 1`, {{3}} = `S/ 300.00`, {{4}} = `Dec 20, 2026, 6:30 PM`

#### `arrival_reminder` — se envía el día anterior a la llegada (WHATSAPP_ARRIVAL_DAYS)

- Categoría: **Utility** (no Marketing). Idiomas: **Spanish (es)** y **English (en)** con el mismo nombre. Sin encabezado, pie ni botones.
- Variables: {{1}} = nombre; {{2}} = alojamiento; {{3}} = fecha de llegada.
- Texto Spanish (es) (copia exacta):

  ```text
  Hola {{1}}, te esperamos en {{2}} el {{3}}. Si necesitas indicaciones para llegar o vas a retrasarte, responde a este mensaje.
  ```

  Ejemplos que Meta pide para las variables: {{1}} = `Ana`, {{2}} = `Casa 1`, {{3}} = `21 dic 2026`

- Texto English (en) (copia exacta):

  ```text
  Hi {{1}}, we look forward to welcoming you at {{2}} on {{3}}. If you need directions or you are going to be late, reply to this message.
  ```

  Ejemplos que Meta pide para las variables: {{1}} = `Ana`, {{2}} = `House 1`, {{3}} = `Dec 21, 2026`

#### `post_stay` — se envía después de la salida (desde las 14:00 del día de salida)

- Categoría: **Utility** (no Marketing). Idiomas: **Spanish (es)** y **English (en)** con el mismo nombre. Sin encabezado, pie ni botones.
- Variables: {{1}} = nombre; {{2}} = alojamiento.
- Texto Spanish (es) (copia exacta):

  ```text
  Hola {{1}}, gracias por alojarte en {{2}}. Esperamos que hayas tenido una buena estancia. Si quieres comentarnos algo sobre ella, responde a este mensaje.
  ```

  Ejemplos que Meta pide para las variables: {{1}} = `Ana`, {{2}} = `Casa 1`

- Texto English (en) (copia exacta):

  ```text
  Hi {{1}}, thank you for staying at {{2}}. We hope you had a good stay. If you would like to tell us anything about it, reply to this message.
  ```

  Ejemplos que Meta pide para las variables: {{1}} = `Ana`, {{2}} = `House 1`

### Activarlo en una instalación
1. Plantillas **Approved** en Meta (arriba) y credenciales cargadas en Vercel (variables de arriba; `WHATSAPP_API_VERSION` incluida) → *Redeploy*.
2. Las rutas `whatsapp-dispatch` (cada 15 min) y `whatsapp-purge` (diaria) ya están en el workflow *Scheduled crons* (`docs/cron.md`); no necesitan secretos nuevos.
3. Mientras no haya credenciales **en producción**, `whatsapp-dispatch` responde 200 con `"status":"not_configured"`, no reclama nada y no envía nada (no finge).
4. Prueba con el **número de prueba de Meta**: haz una reserva de prueba marcando la casilla con **tu** número (debe estar en la lista de destinatarios de prueba de
   Meta), apruébala y ejecuta *Scheduled crons → Run workflow*. Debe llegar `booking_confirmation`; el estado `delivered`/`read` aparece en `whatsapp_messages` por el webhook.
5. Fuera de producción, sin credenciales el cliente **simula** (id `sim_…` en el registro): sirve para probar todo el flujo sin gastar mensajes.

### Retención y privacidad (Ley 29733)
- `whatsapp_messages` (wamid + reserva) y `whatsapp_outbox` se **borran a los 365 días** (`WHATSAPP_RETENTION_DAYS`, mínimo 30, ruta `whatsapp-purge`). El plazo es una
  **propuesta**: lo confirma el dueño (D13).
- La evidencia del opt-in se conserva mientras exista la reserva (es la prueba del consentimiento).
- La mención en el aviso de privacidad (transferencia a Meta/WhatsApp, finalidad, retención y cómo retirar el consentimiento) está en un **borrador** marcado:
  [`privacidad-whatsapp.md`](privacidad-whatsapp.md). No es texto legal definitivo.

## Probar sin gastar mensajes
- Local: sin variables, el cliente simula. Para el webhook, exporta `WHATSAPP_APP_SECRET` y `WHATSAPP_VERIFY_TOKEN` y firma tus propias peticiones
  (`printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WHATSAPP_APP_SECRET"`).
- Meta ofrece un **número de prueba** gratuito en API Setup: úsalo antes de conectar el número real.

## Límites conocidos
- La versión de la Graph API y los códigos de error de Meta cambian con el tiempo; el cliente solo conserva el código numérico en los logs.
- Solo se envían plantillas con cuerpo (`body`) y variables posicionales; encabezados, botones y variables con nombre no están soportados todavía (SD-1009 decide qué plantillas se necesitan).
- Un evento de estado puede llegar antes de que se guarde el mensaje al que se refiere: si es reciente (menos de 60 s) y el mensaje aún no existe, el webhook responde `500` para que Meta lo reenvíe; si es más antiguo se da por ajeno y se confirma.
- Un `401/403` al enviar (token caducado o revocado) se informa como `unauthorized`, distinto de `rejected` (petición inválida): rota `WHATSAPP_ACCESS_TOKEN`.
- `sendWhatsappTemplate` sigue sin comprobar por sí misma el consentimiento (solo el tipo `optIn: true`): la garantía está en el programador
  (`cron_claim_whatsapp_message`), que solo encola reservas con opt-in vigente y lo vuelve a comprobar al reclamar cada mensaje. No añadas otros
  llamadores sin pasar por esa vía.
