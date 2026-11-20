# Aviso de privacidad: mensajes por WhatsApp (BORRADOR)

> **BORRADOR NO LEGAL (SD-1009).** Lo redacta el equipo técnico para que el dueño o su abogado lo revisen y lo conviertan en texto definitivo (decisión D12).
> No lo publiques tal cual. Describe lo que el sistema **hace** hoy; el texto legal exacto no se inventa.

## Qué datos se tratan
- **Teléfono** que el huésped escribe en el formulario de reserva (ya se guardaba con la reserva) y su **consentimiento** para mensajes de WhatsApp.
- **Mensajes que el huésped nos escribe** por WhatsApp (número, nombre de perfil y texto) y la respuesta automática. «STOP» o «BAJA» retira el consentimiento.
- **Registro de mensajes** enviados: identificador del mensaje en WhatsApp, plantilla, idioma, reserva, estado de entrega y fecha. **No** se guarda el texto del mensaje ni se copia el teléfono al registro.

## Para qué
Enviar al huésped, **solo si marcó la casilla**, mensajes sobre **su reserva**: confirmación, recordatorio del adelanto, recordatorio de llegada y agradecimiento tras la estadía. No se usan para publicidad.

## Con quién se comparte
El número y el contenido de cada mensaje se transfieren a **WhatsApp / Meta** (WhatsApp Business Cloud API), que puede tratarlos fuera del Perú. *(Texto legal sobre transferencia internacional: pendiente del dueño.)*

## Consentimiento y cómo retirarlo
- Casilla separada de los términos, opcional y desmarcada por defecto. Se guarda la fecha, el texto exacto mostrado y su versión.
- El huésped puede retirarlo en cualquier momento avisando al alojamiento; el sistema deja de enviarle mensajes de esa reserva en cuanto se registra (`whatsapp_optins.revoked_at`).

## Cuánto tiempo se conservan
- Registro de mensajes y bandeja de entrada: **365 días** (propuesta, D13), luego se borra automáticamente.
- Constancia del consentimiento: mientras exista la reserva.

## Derechos (Ley 29733)
Acceso, rectificación, cancelación y oposición: **[correo o formulario de contacto del titular: pendiente del dueño]**.
