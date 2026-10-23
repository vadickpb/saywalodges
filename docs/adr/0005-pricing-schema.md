# ADR 0005 · Modelo de temporadas, tarifas y cargos

- Estado: aceptado para implementación local en SD-205 · Fecha: 2026-10-22

## Contexto

Las tarifas antiguas (`rate_tiers`) son textos de presentación, no datos con los que se pueda
cotizar. SD-204 separa las unidades reservables de los espacios de la galería. Se necesita un
modelo numérico aislado por organización para el motor de SD-206 y el editor de SD-207.

## Decisión

- `properties.currency` determina la moneda de los importes: `PEN` o `USD`. Las propiedades
  nuevas usan PEN; Saywa usa USD según el contenido publicado existente. Cambiar esta columna
  no convierte importes: el editor deberá explicar que moneda e importes se configuran juntos.
- `seasons` pertenece a una propiedad. Sus fechas son un intervalo de noches `[start_date, end_date)`
  con límites finitos y prioridad no negativa. Se pueden solapar temporadas de distinta prioridad;
  gana la mayor en SD-206. Un exclusion constraint rechaza solapes de igual prioridad dentro de
  la misma propiedad, evitando un desempate arbitrario. Dos intervalos adyacentes son válidos.
- `unit_rates` pertenece a una unidad y opcionalmente a una temporada de esa misma propiedad
  y organización. `season_id = null` significa tarifa base. Se admite una única base por unidad
  y una única tarifa por combinación unidad/temporada.
- Los importes son enteros en céntimos, no negativos: noche, noche de fin de semana y huésped
  extra. `weekend_nightly_cents = null` permite reutilizar la tarifa normal; cero es un importe
  explícito válido. El mínimo de noches es un entero positivo. SD-206 define el cálculo efectivo.
- `fees` se configura por unidad y su importe se aplica por estancia (`per_stay`), noche
  (`per_night`) o huésped (`per_guest`). No se incluyen cargos globales por propiedad en este ticket.
- Las claves de unicidad y exclusión incluyen `org_id` para que un intento de insertar datos
  con padres ajenos no revele existencia de temporadas/tarifas antes de que falle la FK.
- FKs compuestas mantienen consistentes unidad, temporada, propiedad y organización. Borrar una
  unidad elimina sus tarifas/cargos; borrar una temporada elimina sus tarifas específicas y
  conserva la tarifa base. No se transforma una tarifa de temporada en base al borrar su temporada.
- Miembros pueden administrar los datos de su organización. Los visitantes solo leen temporadas de
  propiedades publicadas y tarifas/cargos de unidades activas de propiedades publicadas.
  Identidades, organización, propiedad, unidad y timestamps no son editables mediante REST.

## Consecuencias

- No se elimina `rate_tiers` ni se cambia la presentación pública hasta SD-208.
- Este ticket no añade pantalla de tarifas ni cotizador. El motor es SD-206; el editor es SD-207.
- La migración no crea tarifas en producción. El seed local usa las referencias antiguas USD 220/300
  para Saywa; el año 2027 es un ejemplo explícito. Importes de fin de semana/extra y mínimo de noches
  son valores de ejemplo hasta confirmar reglas comerciales. El feriado y el cargo del tenant demo
  son ficticios. El propietario confirmó USD 500 por noche de feriado: el seed incluye los 16 feriados
  nacionales de 2027 con prioridad 20, frente a 10 de la temporada alta. Fechas contrastadas con
  [Time and Date](https://www.timeanddate.com/holidays/peru/2027) y la lista nacional de
  [gob.pe](https://www.gob.pe/feriados); los días puente y feriados regionales no se incluyen.
  Cada fecha cubre la noche que comienza en ella; no se amplía automáticamente a fines de semana.
- No se importan usuarios de desarrollo ni seed en la base remota. La migración se aplica por el
  procedimiento de despliegue del proyecto antes de código que dependa del nuevo esquema.
