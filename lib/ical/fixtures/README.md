# Fixtures SD-305

Extractos de exportaciones reales publicadas por sus usuarios, anonimizados el 2026-10-29:

- Airbnb: https://gist.github.com/sojo-chad/487d6fc61664da86caacb67c83964c59
  (`s3_example1.ics`, 2022-03-09). Primeros tres eventos; UID, código de reserva,
  teléfono y año reemplazados. Se conserva DESCRIPTION plegada y adyacencia.
- Booking: https://supportcenter.devexpress.com/ticket/details/t726652/how-to-load-custom-fields-when-icalendarimporter-is-used
  (exportación aportada por el usuario, 2019). UID, nombres y año reemplazados;
  se conservan cabeceras, fechas de mes/día y formato CLOSED.

No se descargan calendarios privados ni se usan credenciales de los canales.
Los fixtures prueban compatibilidad del formato publicado, no conectividad real con una cuenta OTA.
