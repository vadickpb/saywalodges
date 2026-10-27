# ADR 0007 · Libro de ingresos y egresos

- Estado: aceptado (SD-801) · Fecha: 2026-10-25

## Contexto

Los dueños necesitan registrar ingresos (alquileres) y egresos (agua, luz, limpieza y mantenimiento por
alquiler, comisiones) de una o varias casas, ver reportes de rendimiento comparables a los de Airbnb y
entregar a su contador un Excel claro. Las reservas (Fase 4) y el calendario iCal (Fase 3) todavía no existen,
pero el módulo debe ser útil desde ya y aceptar después la carga automática sin rehacer el esquema.

## Decisión

- **Un solo libro**: `finance_entries` guarda cada movimiento, de ingreso o de egreso; `kind` lo fija la categoría
  mediante una FK compuesta `(category_id, kind)`, de modo que un movimiento no puede contradecir su categoría.
  Los alquileres no son una tabla aparte: un ingreso de alquiler lleva `stay_start`/`stay_end` (`[)`, fechas civiles
  de `America/Lima`), canal y huéspedes. Los costos de un alquiler (limpieza, mantenimiento, comisión de plataforma)
  son egresos con `related_entry_id`. Cuando exista `calendar_blocks`/`bookings`, se enlazan por `source` +
  `external_ref` (único por org) sin migrar los datos manuales.
- **Varias casas** = varias `units` de la misma propiedad (SD-204); `unit_id` null significa gasto general.
- **Moneda**: cada movimiento conserva su moneda original en céntimos. Si no es PEN, `fx_rate_pen` es obligatorio
  (lo escribe el usuario; la UI propone el último usado) y `amount_pen_cents` es una columna generada. Los reportes
  y el Excel totalizan en PEN, que es lo que usa el contador; la moneda original sigue visible. No se consulta un
  tipo de cambio externo en esta fase.
- **Ingreso bruto y comisión**: el alquiler se registra por su monto bruto; la comisión de la plataforma es un
  egreso ligado (categoría "Comisiones de plataforma"). Así los reportes muestran bruto, comisión y neto por canal.
- **Dos bases de cálculo**, ambas correctas y siempre etiquetadas en la UI:
  - *Por cobro* (caja): el movimiento cuenta en `occurred_on`. Base del Excel contable.
  - *Por estadía* (rendimiento): el ingreso de alquiler se reparte por noche entre los meses que cubre la estadía.
    Base de ocupación, ADR y RevPAR, como Airbnb. Los egresos ligados a un alquiler siguen a ese alquiler.
  El reparto usa aritmética entera; el residuo de céntimos se asigna a la última noche para que la suma sea exacta.
- **Noches disponibles** = días en que la unidad estuvo activa. Hasta SD-807 no se descuentan bloqueos del dueño, y
  el reporte lo indica.
- **Permisos**: el owner ve y edita todo; el staff registra y solo ve y edita lo que él creó, por lo que nunca ve
  totales ni movimientos ajenos. Reportes y Excel son solo del owner (DAL + RLS). Helper `private.is_owner(org_id)`.
- **Comprobantes**: solo un archivo adjunto (foto o PDF), sin campos fiscales. Bucket **privado**
  `finance-receipts` con prefijo `{org_id}/`, tipo validado por contenido y enlaces firmados de corta duración.
  Nunca se usa el bucket público de fotos del sitio.
- **Cálculos puros** en `lib/domain/finance.ts` y `lib/domain/finance-reports.ts` (sin I/O, BigInt como
  `pricing.ts`, cobertura ≥ 90 %). El panel y el Excel usan las mismas funciones, así que sus cifras coinciden.
- **Excel** generado en el servidor con `exceljs` (celdas de fecha y número reales, sin binarios nativos); gráficos
  del panel en SVG propio, sin dependencia.
- **Borrado**: definitivo, con confirmación. El historial de cambios queda para el log de auditoría (SD-605).

## Consecuencias

- El módulo es útil sin reservas ni calendario; SD-807 solo agrega fuentes (`booking`, `ical`) y mejora la ocupación.
- Las cifras "por estadía" y "por cobro" de un mismo mes pueden diferir; la UI y el Excel deben nombrar la base usada.
- Sin campos de comprobante (RUC, serie, número), el contador obtiene esos datos de la foto. Agregarlos después es
  una migración aditiva.
- El tipo de cambio manual depende del usuario; un error de TC afecta los totales en PEN de ese movimiento, que
  puede editarse.
