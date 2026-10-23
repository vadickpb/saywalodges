# ADR 0006 · Cálculo de una estancia

- Estado: aceptado · Fecha: 2026-10-23

## Contexto

SD-205 define el esquema de precios. SD-206 necesita un cálculo reproducible sin I/O para que
SD-207 muestre una simulación y el servidor de reservas pueda recalcular el importe autoritativo.

## Decisión

- `lib/domain/pricing.ts#quoteStay` recibe unidad, moneda, tarifas, temporadas, cargos,
  fechas, huéspedes y porcentaje de adelanto. Valida los valores en runtime con zod y devuelve
  un resultado discriminado (`ok`) con desglose o error tipado; no consulta Supabase.
- Las fechas son valores civiles de `America/Lima` en formato `YYYY-MM-DD`, con checkout
  excluido. La representación UTC se usa solo para sumar días y determinar el día de semana,
  sin convertir una fecha de Lima en un instante. No hay dependencia de la fecha actual ni de
  la zona del equipo. Límite técnico explícito: 366 noches por llamada para acotar el desglose.
- Cada noche elige la temporada de mayor prioridad que cubra esa fecha. Sin temporada aplica
  la tarifa base. Si falta la tarifa elegida, devuelve `MISSING_RATE`; nunca sustituye una
  temporada/feriado sin precio por una tarifa inferior. Dos ganadoras con igual prioridad
  devuelven `AMBIGUOUS_SEASON`. Configuraciones duplicadas o referencias colgantes se rechazan.
- Viernes y sábado usan `weekendNightlyCents` de la tarifa elegida; null reutiliza su precio
  normal y cero sigue siendo un importe explícito válido. La tarifa de llegada determina el
  mínimo de noches de toda la estancia; una temporada posterior no cambia ese mínimo.
- Huéspedes extra = máximo entre cero y huéspedes menos incluidos. Se cobran por noche con el
  extra de la tarifa elegida, sin superar la capacidad ni cotizar una unidad inactiva.
- Los cargos se aplican una vez por estancia, por noche o una vez por huésped de la estancia
  (todos los huéspedes, no solo los extra). No existe un cargo implícito por huésped-noche.
- Los productos y sumas monetarios se calculan con BigInt; se devuelven enteros numéricos solo
  dentro de `Number.MAX_SAFE_INTEGER`. Desbordar devuelve `AMOUNT_OVERFLOW`, no un total redondeado
  silenciosamente. Todos los importes de una cotización comparten moneda; no hay conversión.
- El adelanto se calcula sobre alojamiento más cargos. `depositPercent` es un entero entre
  0 y 100 requerido por el llamador, sin política fija para Saywa. Se redondea al céntimo más
  cercano, con medio céntimo hacia arriba, y el saldo es exactamente total menos adelanto.

## Consecuencias

- El módulo puro puede alimentar la vista previa. La futura acción/route autoritativa deberá
  resolver sesión/tenant, cargar precios y política de adelanto del servidor y llamar al motor:
  ni las tarifas ni el total enviados por el navegador son una fuente de verdad. Los DTO usan
  camelCase; su adaptación desde filas SQL corresponde al DAL de esos tickets.
- El motor filtra tarifas y cargos por unidad, pero no autoriza ni sustituye RLS. Las temporadas
  deben venir del alojamiento correcto. No verifica disponibilidad ni crea reservas; esas son
  responsabilidades posteriores del calendario/RPC transaccional.
- Este ticket no añade UI, persistencia del porcentaje de adelanto ni migraciones. La simulación
  es SD-207; la conexión con cotizaciones/reservas y sus validaciones de almacenamiento es Fase 4.
- La cobertura del archivo del motor debe ser al menos 90 % en líneas, sentencias, funciones y
  ramas. `@vitest/coverage-v8` (misma versión que Vitest) es una dependencia solo de desarrollo
  necesaria para medir ese criterio. CI ejecuta la suite con cobertura; los informes se ignoran
  tanto en Git como en ESLint.
