# Mensajes para tus huéspedes (SD-1130)

Escribes cada mensaje **una vez**; en cada reserva del calendario aparece ya completado con el nombre y las fechas de esa
estadía, listo para enviar. Funciona desde el primer día, sin esperar a Meta: el botón abre tu WhatsApp con el chat del huésped y
el texto escrito (tú pulsas *Enviar*), o lo copias para pegarlo en el chat de Airbnb.

## Cómo se usa
1. **Ajustes → Mensajes para tus huéspedes** (solo el dueño). Primero «Datos de la casa»: hora de check-in y check-out, WiFi, código
   de la puerta, enlace de ubicación (https), tu teléfono y las reglas de la casa en español e inglés.
2. Revisa los 7 mensajes que ya vienen escritos (confirmación, antes de tu llegada, día de llegada, bienvenida, reglas de la casa,
   antes de la salida, despedida) y cámbialos a tu gusto. Cada uno tiene su versión en español y en inglés; se usa la del idioma
   de la estadía. Puedes agregar hasta 6 mensajes propios (taxis, tours, cuna…). «Restaurar el texto original» vuelve al de fábrica.
3. En el calendario, toca una reserva → **Datos de la estadía** (nombre, WhatsApp, idioma…) → más abajo **Mensajes**. Toca el título
   para ver el texto armado; **Enviar por WhatsApp** o **Copiar**. El que «Toca hoy» aparece primero. También está en la ficha de
   cada reserva (Reservas).

## Variables
Toca una variable en el editor para insertarla donde tengas el cursor: `{saludo}` («Hola Ana»; sin nombre, solo «Hola»), `{nombre}`,
`{villa}`, `{llegada}`, `{salida}`, `{noches}`, `{huespedes}`, `{hora_checkin}`, `{hora_checkout}`, `{wifi_nombre}`, `{wifi_clave}`,
`{codigo_puerta}`, `{ubicacion}`, `{contacto}`, `{reglas}` y `{pedidos}` (los pedidos especiales anotados en esa estadía).
Una variable mal escrita (`{nombrre}`) no se puede guardar.

## Reglas que el sistema aplica por ti
- **Sin dato, sin línea**: si una línea necesita un dato que no existe (no hay WiFi guardado, la estadía no tiene pedidos) se omite
  entera, para que nunca salga «Clave: » vacío. Debajo del mensaje te avisa qué falta.
- **Datos sensibles**: la clave del WiFi y el código de la puerta solo se completan **desde 2 días antes de la llegada** hasta la salida;
  antes dicen «(te la envío cerca de tu llegada)». Además, **el servidor ni siquiera los envía al navegador** para las estadías fuera de
  esa ventana. Lo que sí pueden hacer los miembros del equipo es leer esos datos con su propia sesión (se guardan en la tabla de la
  casa, legible por el equipo para poder enviar mensajes): no es un secreto frente al personal, es para que no viajen antes de tiempo
  ni queden en pantallas de reservas lejanas. Solo el dueño los edita.
- **Fechas** en el idioma del huésped y sin desfase de zona horaria.
- El mensaje sigue lo que escribes en la tarjeta: si acabas de poner el nombre, el saludo ya lo usa.

## Escribir buenos mensajes
Pon cada dato opcional **en su propia línea** (`{huespedes} huéspedes.`, `Ubicación: {ubicacion}`): si falta, se omite esa línea y el
resto del mensaje sale completo. Una línea con varios datos se omite entera si falta uno.

## Qué NO hace todavía
- No marca qué mensajes ya enviaste ni guarda un historial (SD-1131: línea de tiempo por estadía).
- No hay lista «Hoy» con todo lo que toca (SD-1132).
- No envía solo: con la API de WhatsApp de Meta (cuando esté lista) los mensajes con plantilla aprobada podrán salir automáticos
  (`docs/whatsapp.md`); el texto libre (bienvenida, reglas) siempre lo envías tú o dentro de las 24 h de una conversación.
