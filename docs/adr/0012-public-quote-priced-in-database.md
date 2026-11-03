# ADR 0012 · Cotización pública: la base de datos calcula el precio

- Estado: aceptado (SD-404) · Fecha: 2026-11-03

## Contexto

SD-404 deja que el huésped cotice su estadía desde el sitio, sin pasar por el dueño. Hasta ahora las cotizaciones las crea el
dueño con una RPC de sesión (ADR 0009): la aplicación calcula el precio con `lib/domain/pricing.ts` y la base **confía** en los
importes que recibe (solo comprueba que el desglose sea coherente y que el adelanto siga la política). Eso es aceptable cuando quien
llama es un miembro de la organización. Con un **anónimo** no lo es: con la clave pública de Supabase cualquiera puede llamar a la
RPC directamente y cotizar una noche en un sol.

Alternativas evaluadas:

1. **Firmar el precio** en el servidor y verificar la firma en la base. Un solo motor de precios, pero exige un secreto por
   instalación en la base y en Vercel (un paso manual más, y rotación).
2. **service-role en una acción pública.** Lo más simple de escribir, pero rompe la regla de ADR 0002 (service-role solo en webhooks,
   cron y RPC) y amplía el daño si el código se compromete.
3. **Recalcular en la base** (elegida por el dueño).

## Decisión

- `public.create_public_quote(p_host, p_unit_id, p_check_in, p_check_out, p_guests)`: ejecutable por `anon`. **No recibe ningún
  importe**: solo el escenario. La base calcula el precio con las tarifas, temporadas, cargos y la política de adelanto guardados.
- El cálculo es `private.price_stay`, un **port a SQL de `quoteStay`** (ADR 0006). Se mantienen idénticos con dos pruebas gemelas que
  usan el mismo montaje y las mismas cifras calculadas a mano: `lib/domain/pricing-parity.test.ts` y
  `supabase/tests/0028_public_quote.test.sql`. Si cambian las reglas de precio, hay que cambiar los dos motores y las dos pruebas.
- La unidad debe pertenecer a una propiedad **publicada** servida desde el host de la petición; unidad desconocida, host equivocado y
  propiedad sin publicar responden igual (`UNIT_NOT_FOUND`).
- Los resultados de negocio (estadía mínima, capacidad, fechas ocupadas, tarifa ausente) vuelven como datos `{"ok": false, "error": …}`;
  solo la entrada mal formada o el abuso lanzan errores (`22004`, `22023`, `54000`).
- Máximo 30 noches, fechas dentro de ~2 años y validez de 24 horas. La disponibilidad es solo orientativa: manda el *exclusion constraint* de `calendar_blocks`
  al reservar (ADR 0003).
- **Antiabuso:** las cotizaciones públicas llevan una marca explícita `quotes.is_public` (no se deduce de `created_by`, que pasa a nulo si se
  borra un usuario) y tienen topes **por debajo** de los del dueño (150 abiertas y 100 por día, frente a 500 y 300 de `create_quote`), con un
  bloqueo asesor propio, de modo que una inundación nunca impide al dueño cotizar. La lista «Cotizaciones abiertas» del dueño excluye las
  públicas, para que no desplacen sus enlaces. Cada llamada crea su propia cotización y su propio token: nunca se reutiliza una entre huéspedes (el reemplazo de una reserva
  ya convertida devolvería su `public_token`, hallazgo H2 de SD-403). Los límites por origen (IP) son SD-409, en la capa de aplicación.
- **Bloqueo de calendario por encadenamiento** (hallazgo de la revisión de seguridad). Cualquiera con la clave pública puede llamar a las RPC
  directamente, sin pasar por la web: cotizar, reservar y subir un archivo cualquiera como comprobante. Un comprobante en revisión impide que la
  retención venza, así que esas fechas quedan bloqueadas hasta que el dueño rechace. Mitigación en la base: **una unidad admite como máximo 3
  reservas `pending_payment` nacidas de cotizaciones públicas a la vez**, las estadías públicas son de 30 noches como máximo y las fechas
  deben caer en ~2 años.

## Riesgo que queda abierto

Un abusador paciente puede seguir fijando hasta 3 reservas por unidad (30 noches cada una) mientras el dueño no las rechace, y repetirlo
cuando lo haga. Las mitigaciones que faltan, deliberadamente fuera de SD-404:

- **Aviso al dueño** de cada comprobante nuevo (SD-407 por correo, SD-1009 por WhatsApp) y destacar en SD-406 los comprobantes con muchas horas
  en revisión (ya existe el filtro «Comprobante por revisar»).
- **Caducidad de la revisión** para reservas nacidas de cotizaciones públicas (por ejemplo, 72 h después de vencer la retención): evitaría el
  bloqueo indefinido, a costa de que un pago real sin revisar pueda perder sus fechas. Es una decisión de negocio del dueño (SD-409).
- **Límite por origen y captcha/BotID** en la capa de aplicación (SD-409). Ojo: no frena a quien llama a las RPC directamente.
- Si el abuso real lo exige, volver a la alternativa 1 (firmar el precio) o 2 (service-role en una acción protegida con límite), que cierran
  la llamada directa a la base.

## Consecuencias

- Dos motores de precios que hay que mantener iguales. El riesgo de divergencia queda acotado por las pruebas gemelas, que fallan en el
  CI si una de las dos se toca sola.
- La ruta del dueño (ADR 0009) no cambia.
- Sin secretos nuevos, sin excepciones a ADR 0002 y sin pasos manuales por instalación.
