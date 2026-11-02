# ADR 0009 · Guardar cotizaciones con una RPC de sesión

- Estado: aceptado (SD-402) · Fecha: 2026-11-01

## Contexto

`quotes` (SD-401) no concede escritura a los miembros: el comentario del esquema decía «el servidor escribe las
cotizaciones tras ejecutar `quoteStay`». Pero el motor de precios vive en TypeScript (ADR 0006) y la regla de
arquitectura prohíbe la service-role en acciones de usuario (ADR 0002: solo webhooks, cron y RPCs). Había que elegir
cómo escribe SD-402 sin romper ninguna de las dos cosas, y sin aceptar importes del cliente.

Alternativas evaluadas:

1. **RPC solo para service-role**, llamada desde la acción con `lib/supabase/admin.ts`. Es lo más estricto con los
   importes, pero rompe la regla de no usar service-role en acciones de usuario y obliga a documentar esa excepción.
2. **Reescribir el motor de precios en SQL** para que la base recalcule. Duplica la lógica de ADR 0006 y garantiza que
   algún día los dos cálculos diverjan.
3. **RPC de sesión** que recibe el precio ya calculado por el servidor y lo valida (elegida).

## Decisión

- Nueva función `public.create_quote(...)`, `SECURITY DEFINER`, `search_path` vacío, ejecutable solo por `authenticated`.
  Es la **única** vía de escritura de los miembros sobre `quotes`; la tabla sigue sin grants de escritura.
- La acción (`app/app/quotes/actions.ts`) valida con zod, la DAL (`lib/dal/quotes.ts`) carga unidad, tarifas, temporadas,
  cargos, moneda y política de adelanto **del tenant verificado**, recalcula con `quoteStay` y llama a la RPC. El formulario
  solo aporta unidad, fechas, huéspedes e idioma del mensaje.
- La base comprueba antes de insertar: que el llamador sea miembro de `p_org_id`; que la unidad pertenezca a esa
  organización, esté activa y admita los huéspedes; fechas válidas (hoy en Lima o después, máximo 366 noches); que el
  desglose sea coherente (`alojamiento + cargos = total`); y que el adelanto sea exactamente
  `total × deposit_percent / 100` redondeado hacia arriba en el medio céntimo (igual que el motor).
- **La moneda nunca es un parámetro**: es la de la propiedad.
- Política de adelanto: `properties.deposit_percent` (entero 0–100, por defecto 50), con el mismo patrón que
  `booking_hold_minutes` (grant de `UPDATE` por columna a `authenticated`). **Solo un `owner` puede cambiarlo**: un
  trigger (`private.guard_deposit_percent`) rechaza con `42501` el cambio hecho por personal (`staff`); `service_role` y el
  dueño de la tabla (migraciones, mantenimiento) siguen permitidos. Cada cotización copia el porcentaje y los importes al
  crearse; cambiar la política después no altera cotizaciones ya enviadas.
- Vigencia del enlace: 72 horas desde la aplicación (`QUOTE_VALID_HOURS`); la base acepta de 1 a 168 horas.
- Límites contra abuso (un miembro que llame a la RPC a mano no debe poder llenar la base compartida): desglose acotado
  (solo claves conocidas, máximo 366 noches y 50 cargos, 120 kB), importes enteros no negativos, y por organización
  máximo 500 cotizaciones abiertas y 300 creadas en las últimas 24 horas. Un bloqueo asesor (`pg_advisory_xact_lock`)
  por organización serializa las llamadas para que una carrera no sobrepase los topes. El tope de abiertas cuenta
  también las que ya se convirtieron en reserva (solo lo hace algo más estricto).
- El token tiene 64 caracteres hexadecimales (dos UUID aleatorios, sin depender de `pgcrypto`).

## Límite de confianza (qué NO garantiza)

La base **no puede recalcular el precio**, solo comprobar que es coherente consigo mismo y con la política guardada.
Un miembro de la organización (propietario o personal) que llame a la RPC a mano, saltándose la aplicación, podría
guardar un total distinto del que daría el motor. Se acepta porque:

- solo afecta a la propia organización del llamador: el aislamiento entre organizaciones no se debilita;
- ese mismo miembro ya puede editar tarifas, temporadas y cargos (SD-207), así que no gana una capacidad nueva;
- el huésped nunca escribe: solo consume un token.

Si algún día el personal con rol limitado no debe poder fijar precios, la RPC debe restringirse a `owner` o pasar a la
alternativa 1. Eso queda anotado como decisión pendiente, no como deuda oculta.

## Consecuencias

- **Para SD-403 (checkout público):** `quotes.breakdown` es JSON validado solo en forma y coherencia de importes, no en
  contenido (por ejemplo, el nombre de un cargo es texto libre). El checkout debe mostrar `total_cents` y `deposit_cents`
  de las **columnas**, nunca importes del desglose, y pasar el desglose por zod antes de pintarlo.
- Cualquier miembro (incluido el personal) puede leer los tokens de las cotizaciones abiertas de su organización por
  RLS: tiene, por diseño, la misma capacidad que el huésped sobre ellas.
- La disponibilidad **no** se comprueba en `create_quote`: la acción avisa antes de generar el enlace, pero la autoridad
  sigue siendo el exclusion constraint de `calendar_blocks` al convertir la cotización en reserva (ADR 0003).
- El enlace compartido es `/{lang}/reservar/{token}`. La página que lo atiende es el checkout de SD-403; hasta que se
  despliegue, el enlace no resuelve a ninguna pantalla.
- Migración aditiva (columna con default + función nueva). Rollback documentado en la propia migración.
- Pruebas: `supabase/tests/0022_create_quote.test.sql` (aislamiento entre organizaciones, validaciones, grants,
  redondeo, tope) y tests unitarios de dominio y acción.
