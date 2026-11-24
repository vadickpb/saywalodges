# Plan de negocio de HostStay: vender, instalar, mantener y cerrar Saywa Lodges

Fecha: 2026-11-24. Para el dueño (no técnico). Complementa [`plan-comercial.md`](plan-comercial.md) (qué se construye),
[`cola.md`](cola.md) (orden de trabajo) y [`decisiones-pendientes.md`](decisiones-pendientes.md) (lo que decides tú).
Modelo: una instalación por cliente ([ADR 0010](adr/0010-installation-per-client.md), [ADR 0019](adr/0019-product-core-and-customization-levels.md)).

> **Qué es dato y qué es supuesto.** Los errores (sección 1) salen de herramientas que leí hoy: Vercel, Supabase, GitHub.
> Los **precios de terceros** (Supabase, Vercel, Resend, Meta, dominios) son los que conozco a la fecha de este documento:
> **verifícalos en sus páginas de precios antes de enviar una proforma**. Tipo de cambio de planificación: **S/ 3,75 por USD**.
> Los precios de venta son una **recomendación**; la decisión es tuya (D15).

## 0. Resumen en una página

1. **Hoy no puedes cobrarle a nadie con tranquilidad por tres razones concretas**: (a) el cron que envía los correos de
   reserva falla **en cada ejecución desde el 20-nov** (falta configuración en Vercel; ningún huésped recibiría correos);
   (b) Supabase de Saywa Lodges sigue en plan **free**, sin backups descargables; (c) no hay páginas legales ni Libro de
   Reclamaciones. Las tres se arreglan en la **semana 1** (secciones 1 y 7).
2. **Costos**: una instalación cuesta alrededor de **USD 11 al mes** (S/ 45) en infraestructura; los costos fijos del
   vendedor son unos **USD 55 al mes** (S/ 206). No es caro: el riesgo no es el dinero, es **tu tiempo de soporte**.
3. **Precios recomendados** (se envían por proforma, D4): **Esencial** S/ 1.800 + S/ 160/mes · **Pro** S/ 3.200 + S/ 290/mes ·
   **A medida** desde S/ 5.500 + S/ 480/mes. La infraestructura va **incluida** en la mensualidad. Con 5 clientes
   (3 Esencial + 2 Pro) quedan unos **S/ 580/mes netos** de mantenimiento, además de las instalaciones.
4. **Cliente a salvo, tú a salvo**: el dominio, los datos y las cuentas de pago son del cliente; el código y la
   infraestructura son tuyos. Si deja de pagar no pierde sus datos: se le entrega una exportación y puede llevarse su proyecto.
5. **Venta sin pagar anuncios**: demo + caso Saywa Lodges + contenido corto en Instagram/TikTok + grupos de anfitriones de
   Cusco y el Valle Sagrado + 10 conversaciones por semana. Anuncios solo después de 3 ventas y de medir (sección 4.7).
6. **Tutoriales**: **serie de videos cortos (1–3 min) por tarea**, con texto en pantalla y subtítulos, voz IA opcional,
   más una página de Ayuda dentro del panel. Un video largo único **no** es más profesional: nadie lo ve completo ni
   sirve para buscar «cómo bloqueo fechas» (sección 5).
7. **Orden de las próximas 4 semanas** en la sección 8 y **tus decisiones con mi recomendación** en la sección 9.

## 1. Errores actuales de HostStay (lista priorizada)

Fuentes leídas hoy (solo lectura): errores y logs de Vercel (proyectos `saywalodges`, `hoststay`), *advisors* de Supabase del
proyecto de Saywa Lodges, GitHub Actions, PRs abiertos y archivos sin seguimiento. No hay *issues* abiertos en GitHub (0).

| Prio | Qué pasa | Evidencia | Impacto | Ticket | Quién |
|---|---|---|---|---|---|
| **P0** | El cron `booking-emails` responde **500 en cada ejecución** desde el 20-nov | Vercel: 15 errores `cron.booking_emails.not_configured`; el workflow *Scheduled crons* falló en 10 de las últimas 12 ejecuciones | Ningún correo de reserva, comprobante o recordatorio saldría. Bloquea la primera reserva real. Además llena tu correo de alertas y las tapa para fallos reales | SD-1401 | Dueño (variables en Vercel) + Claude |
| **P1** | El *preview* `hoststay` (web de ventas) **siempre falla** en los PRs | Build de `hoststay`: `Invalid environment configuration: NEXT_PUBLIC_SUPABASE_URL… undefined`. Producción sí está *Ready* | Check rojo en cada PR (incluido el de release-please); ruido que oculta un fallo real | SD-1402 | Claude |
| **P1** | Tras un deploy, el código llegó **antes** que su migración | Vercel: `message_library.read_failed PGRST205` (21-nov); el 19-nov, `getShowcaseUnits … 42501` en 53 peticiones y 44 visitantes durante ~9 h (ya corregido por SD-1116/1117; no se repite desde el 19-nov) | Páginas con error para visitantes reales cuando una migración tarda en aprobarse (el deploy de BD esperó 35 min el 24-nov) | SD-1406 | Claude |
| **P1** | Supabase de Saywa Lodges en plan **free** y proyecto demo también; la organización comparte 2 proyectos viejos inactivos | Supabase: plan `free`; sin backups descargables; protección contra contraseñas filtradas apagada | Riesgo de pausa y de perder datos; incumple ADR 0010 y `produccion.md` | SD-1409 | Solo dueño |
| P2 | PRs de dependencias **mayores** abiertos hace 19 días: #70 (`@types/node` 26), #71 (`eslint` 10), #72 (`typescript` 7; **su CI falla**) | `gh pr list` | Se acumulan y cada día es más difícil mergearlos; #149 (13 mejoras menores) también espera | SD-1403 | Claude |
| P2 | Release **1.1.0** (#127) sin mergear; su CI de las 04:46 quedó en `action_required` y el check de `hoststay` falla | `gh run list` | Los clientes no reciben versión etiquetada; el CHANGELOG queda viejo | SD-1404 | Claude |
| P2 | El workflow de crons falla con ruido: un solo error pinta todo de rojo | 10/12 rojas | Se pierde la costumbre de mirar alertas | SD-1401 | Claude |
| P3 | 5 archivos duplicados `… 2.*` **sin seguir** en tu carpeta principal (`~/Documents/projects/saywa-lodges`): `textarea 2.tsx`, `units 2.ts` y `…rooms_to_spaces 2.sql` son idénticos al original; `seed-local-storage 2.mjs` y `…property_theme_and_content 2.sql` **difieren** | `git status`, `diff` | Un `… 2.sql` en `supabase/migrations/` puede romper `supabase db reset` local con versión duplicada; no llega a CI porque Git no los ve | SD-1405 | Dueño (borrar tras revisar) + Claude (`.gitignore`) |
| P3 | Rutas con `%5C` (barra invertida, típico de escáneres) devuelven **500** en vez de 404 | Vercel: `Cannot find module './.next/server/pages/login%5C.js'` en `saywalodges` y `hoststay` (18-nov) | Solo ruido en los logs | SD-1407 | Codex |
| P3 | Avisos de Supabase | 12 funciones `SECURITY DEFINER` ejecutables por `anon` y 37 por `authenticated` (son las RPC públicas y del dueño, **por diseño**: validan host, token o membresía); 10 tablas con RLS y sin política (solo las usa el servidor, **por diseño**); 50 claves foráneas sin índice y 39 índices sin uso (INFO) | Sin riesgo hoy. Hay que dejar por escrito que son intencionales para que un cliente o un auditor no se alarme | SD-1408 | Claude |

Lo que **no** es un error: el *preview* `hoststay-demo` aparece «Canceled by Ignored Build Step» a propósito.

### Cómo se arregla cada uno (corto)

- **SD-1401.** Variables de producción de `saywalodges` que el cron exige (`RESEND_API_KEY`, `EMAIL_FROM`; ver tabla en
  [`produccion.md`](produccion.md#variables-de-vercel-inventario-completo)) y *Redeploy*. En código: que el health check
  reporte «correo sin configurar» y que el workflow no pinte rojas las otras tres rutas por culpa de una.
- **SD-1402.** El proyecto `hoststay` es la web de ventas (`DEPLOYMENT_MODE=vendor`, que no necesita base de datos, SD-1127),
  pero los *previews* no reciben esa variable. Dos arreglos: poner `DEPLOYMENT_MODE=vendor` también en el entorno *Preview* de
  Vercel (clic del dueño) o agregar un *Ignored Build Step* como el de `hoststay-demo`. Recomendado: la variable en Preview y
  un test que impida construir el proyecto vendor con falta de variables de BD.
- **SD-1406.** Regla: **la migración se aplica antes** de mergear el código que la usa (el dueño ya recibe el aviso);
  mientras tanto, las lecturas que usan tablas nuevas deben degradar con gracia (vacío, no 500) y registrar un evento.
- **SD-1403.** Mergear #149 (menores) tras CI verde; para #70/#71/#72, probar cada mayor en su rama y mergear solo si
  `lint`, `typecheck`, `test`, `build` pasan; cerrar con motivo los que no. Configurar Dependabot para agrupar mayores
  y abrirlos una vez al trimestre.

## 2. Costos y precios

### 2.1 Qué cuesta (USD por mes, verificar)

| Concepto | Costo | Por qué |
|---|---|---|
| Supabase **Pro** | 25 por organización; incluye 10 de crédito de cómputo (cubre 1 proyecto pequeño) | Backups diarios (7 días) y sin pausa. Es requisito de ADR 0010 |
| Cada proyecto Supabase adicional | ≈ 10 (cómputo pequeño) | Una base por cliente (aislamiento total) |
| Vercel **Pro** | 20 por usuario, con créditos de uso; **todos los proyectos caben** | Hobby no permite uso comercial (`runbook-instalacion.md`) |
| Dominio `.com` | ≈ 15 al año (≈ 1,25/mes) | **Lo compra el cliente en su cuenta**; tú configuras el DNS |
| Resend (correo) | Gratis hasta 3.000 correos/mes; 20 si se pasa | Alcanza para decenas de clientes pequeños |
| GitHub Actions (crons, salud) | 0 (repo público) | Ya funciona |
| WhatsApp (Meta) | Por mensaje plantilla; centavos de dólar según categoría y país | **Lo paga el cliente** con la cuenta de WhatsApp Business a su nombre; el servicio dentro de las 24 h suele ser gratis |
| Video y voz IA para tutoriales | 0–25 (una vez) | Sección 5 |

Con los precios anteriores:

- **Costos fijos del vendedor ≈ USD 55/mes (S/ 206)**: Supabase Pro 25 + proyecto demo 10 + Vercel Pro 20.
- **Costo variable por instalación ≈ USD 11–12/mes (S/ 45)**: proyecto Supabase 10 + margen de uso de Vercel/correo.
- Saywa Lodges es tu primera instalación: cuenta como una más en costos (no cobras).
- **Recomendación operativa:** crea una **organización nueva de Supabase solo para HostStay** y mueve ahí Saywa Lodges y la
  demo. Hoy esas bases comparten organización con dos proyectos viejos inactivos (`Clinic Project`, `saas_medico`) y con el
  plan free; pagar Pro en una organización limpia evita mezclar clientes con proyectos personales. Mover un proyecto entre
  organizaciones se hace desde el panel de Supabase (Settings → General → Transfer project).

### 2.2 Cómo se traslada al cliente: tres modelos

| Modelo | Cómo funciona | Pros | Contras |
|---|---|---|---|
| **A · Infraestructura incluida en la mensualidad** (recomendado) | Todo vive en tus cuentas; el cliente paga setup + mensualidad que incluye hosting, backups, actualizaciones y soporte | Una sola cuenta que cobrar; el cliente no ve Supabase ni Vercel; tú controlas versiones y respaldos; es lo que asume el script de instalación | Tú absorbes subidas de precio de terceros (se cubre con la cláusula de la sección 2.5) y tienes responsabilidad de continuidad |
| **B · El cliente paga sus cuentas** | El cliente crea su Supabase Pro (25) y Vercel Pro (20) con su tarjeta y te da acceso | Cero riesgo de costos para ti; propiedad total | USD 45/mes solo de infraestructura para un anfitrión pequeño; fricción alta (tarjeta internacional, crear cuentas); más soporte; el script y los crons asumen tus cuentas |
| **C · Híbrido** | Modelo A al inicio; el cliente puede **«graduarse»** a B pagando una migración | Combina ambos | Hay que tener lista la exportación y el traspaso (SD-1108) |

**Recomendación: A como oferta estándar y C como salida** (el cliente siempre puede llevarse su proyecto; sección 3.5). B solo
se acepta si el cliente insiste y paga la migración inicial como trabajo a medida.

### 2.3 Planes recomendados (por proforma; no se publican precios, D4)

Todos incluyen: instalación, dominio configurado, importación inicial, 3 meses de garantía, infraestructura, respaldos,
actualizaciones por versión y monitoreo. IGV (18 %) aparte si emites factura.

| | **Esencial** | **Pro** | **A medida** |
|---|---|---|---|
| Para quién | 1–2 casas o habitaciones, quiere web propia y calendario sin dobles reservas | Quiere ordenar finanzas y mensajes y ahorrar tiempo | Varias casas, necesidades especiales |
| Módulos | Sitio con SEO, calendario único + iCal, cotizador y reserva con comprobante, panel móvil, guía privada | + finanzas y reportes, biblioteca de mensajes, inventario, WhatsApp automático, importación de historial de Airbnb | + pago en línea (Mercado Pago), CRM y check-in, 1 función a medida al año |
| **Instalación (única vez)** | **S/ 1.800** (≈ USD 480) | **S/ 3.200** (≈ USD 855) | **desde S/ 5.500** (≈ USD 1.470) |
| **Mantenimiento mensual** | **S/ 160** (≈ USD 43) | **S/ 290** (≈ USD 77) | **S/ 480** (≈ USD 128) |
| Pago anual adelantado | 10 meses por 12 | 10 meses por 12 | 10 meses por 12 |
| Soporte | Correo/WhatsApp, respuesta en 1 día hábil | Respuesta en 4 h hábiles para fallos que impidan reservar | Prioridad y 2 h de cambios al mes |
| Trabajo a medida | S/ 120 por hora (≈ USD 32), siempre detrás de un interruptor (ADR 0019) | igual | 1 función al año incluida |

Justificación del precio para el cliente: Airbnb cobra a un anfitrión entre ≈ 3 % y 15,5 % por reserva según su modelo de
comisión (verificarlo en su cuenta). **Una sola reserva directa al mes de 3 noches a S/ 400 la noche (S/ 1.200) le ahorra
entre S/ 36 y S/ 186**; con 2–3 reservas directas al mes el plan Esencial se paga solo. No prometas «ahorro» sin que el
cliente haya visto sus propias cifras (SD-1205 «Airbnb vs. directo» es la prueba).

### 2.4 Cuánto queda (mantenimiento mensual, sin contar instalaciones)

| Clientes que pagan | Ingreso | Costos (206 fijos + 45 × (clientes + Saywa Lodges)) | Neto | Horas de soporte supuestas |
|---|---|---|---|---|
| 1 Esencial | 160 | 296 | **−136** | 2 |
| 2 (1 Esencial + 1 Pro) | 450 | 341 | **109** | 4 |
| 5 (3 Esencial + 2 Pro) | 1.060 | 476 | **584** | 10 |
| 10 (6 Esencial + 4 Pro) | 2.120 | 701 | **1.419** | 20 |

Montos en soles por mes. La conclusión es honesta: **el mantenimiento no te hace rico, cubre costos y te paga el
soporte**; el dinero está en las **instalaciones** (S/ 1.800–5.500 cada una) y en el trabajo a medida. 5 instalaciones en 3
meses son unos S/ 12.000 una sola vez. Por eso importa que cada instalación sea **repetible en menos de un día** (sección 7.5).
Si el soporte supera ≈ 2 h por cliente al mes, sube el precio del plan o mejora los tutoriales (sección 5).

### 2.5 Clientes de varios años

- **Ajuste anual** cada 1.° de enero, con aviso por escrito 60 días antes: el mayor entre el IPC de Lima del último año y 5 %,
  con tope de 12 %. Sube la mensualidad, no el setup ya pagado.
- **Cláusula de costos de terceros:** si Supabase, Vercel o Meta suben sus tarifas más de 15 % acumulado, el proveedor puede
  trasladar la diferencia **proporcional** con 60 días de aviso; el cliente puede terminar sin penalidad en ese plazo.
- **Descuento por fidelidad:** pago anual adelantado = 2 meses gratis. Congela el precio un año y mejora tu flujo de caja.
- **Tipo de cambio:** precios en soles; los costos son en dólares. Revisa la lista de precios cada enero y si el dólar subió
  más de 10 % en el año.
- **Límites del plan** (para que el costo no crezca solo): hasta 5 unidades, 20 GB de fotos y 3.000 correos al mes; más allá
  se cotiza (almacenamiento en Supabase cuesta por GB).

### 2.6 Si el cliente deja de pagar (sin «secuestrar» sus datos)

| Día de atraso | Qué pasa |
|---|---|
| 1–10 | Recordatorio amable por WhatsApp y correo. Todo funciona |
| 11–30 | Se pausan soporte y cambios; el sistema sigue funcionando |
| 31–60 | Aviso formal. El sitio y el calendario siguen; el panel pasa a **solo lectura** |
| Desde el 61 | Se entrega la **exportación completa** (SD-1108) y se ofrece el traspaso del proyecto. La instalación se archiva (sin borrar nada) |
| Día 120 | Si el cliente no responde, se borran los datos personales de huéspedes y se conserva un archivo mínimo exigido por ley |

El contrato borrador dice hoy que quien no paga «conserva su sistema». Con infraestructura en tus cuentas eso es
**insostenible**: tendrías un costo mensual sin ingreso. La tabla anterior corrige la contradicción (D16).
Nunca se retiene el **dominio** (está a nombre del cliente), ni sus **datos** (los recibe aunque deba dinero, una vez),
ni sus **cuentas de pago** (Yape, banco, Mercado Pago: son suyas).

## 3. Contrato y entrega

El borrador está en [`legal/contrato-licencia-mantenimiento.md`](legal/contrato-licencia-mantenimiento.md). **Lo revisa un
abogado peruano antes de firmar** (S/ 300–800 suele bastar por una revisión). La versión 2 (SD-1410) agrega lo de este plan.

### 3.1 Qué incluye la entrega

1. Instalación en `www.<dominio>` y `app.<dominio>` con marca del cliente, sin rastro de HostStay en su sitio.
2. Datos iniciales: casas, tarifas, fotos, espacios, inventario y (Pro) historial de Airbnb.
3. Capacitación de 2 h por videollamada (grabada para el cliente) y acceso a los tutoriales (sección 5).
4. Calendarios sincronizados con Airbnb y Booking, probados con una reserva de prueba.
5. Acta de entrega firmada con la lista de verificación de la sección 7.5.
6. 3 meses de garantía: se corrige sin costo todo lo que no funcione como dice el manual. No cubre cambios de terceros
   (Airbnb, Meta, bancos) ni datos mal cargados.

### 3.2 Soporte (SLA)

| Tipo | Ejemplo | Respuesta | Resolución objetivo |
|---|---|---|---|
| **Crítico** | El sitio no abre o nadie puede reservar | 2 h hábiles (Pro/A medida) · 1 día (Esencial) | 1 día hábil |
| **Alto** | El calendario no sincroniza, no llegan correos | 1 día hábil | 2 días hábiles |
| **Normal** | Cómo hago X, un texto no se ve bien | 2 días hábiles | 5 días hábiles |
| **Mejora** | Quiero una función nueva | Cotización en 5 días | Según cotización |

Horario: lunes a sábado 9:00–18:00 (hora de Lima). Canal único: WhatsApp del soporte y correo; formulario de incidencia
con captura de pantalla (SD-1106). No prometas 24/7: eres una sola persona. El monitoreo (`Installation health`) avisa a ti, no
sustituye el soporte.

### 3.3 Propiedad

| Qué | De quién | Nota |
|---|---|---|
| Datos de huéspedes, reservas, finanzas, fotos, textos | **Cliente** | Es titular del banco de datos (Ley 29733); tú eres «encargado del tratamiento» |
| Dominio | **Cliente** (a su nombre) | Tú solo ajustas DNS. Si lo compras tú, se transfiere al terminar |
| Cuentas de pago, WhatsApp Business, Google Business | **Cliente** | |
| Código fuente de HostStay | **Tú** | Licencia no exclusiva y limitada a un alojamiento; repositorio visible, no reutilizable (`LICENSE`, D9) |
| Proyectos Supabase y Vercel | **Tú** (modelo A) | Se traspasan a pedido (sección 3.5) |
| Marca «HostStay» | **Tú** | Revisar en INDECOPI (D7) |

### 3.4 Mantenimiento y actualizaciones

- Mejoras y correcciones llegan a **todos** los clientes con el mismo código (ADR 0019), por versión (`release-please`,
  SD-903): `main` actualiza la demo y cada versión (`v1.1.0`, …) se despliega a los clientes con aviso previo.
- **Ventana de actualización**: lunes a jueves antes de las 10:00 (hora de Lima); nunca viernes ni feriados ni temporada alta
  del cliente. Cada versión se prueba primero en la demo y en Saywa Lodges.
- Las migraciones de base de datos son aditivas y las aprueba el dueño (*Deploy database*).
- Cada trimestre: prueba de restauración de respaldo por instalación (`produccion.md`, sección 4) y revisión de dependencias.
- Cambios a medida: ticket cotizado, entra a `main` apagado y se enciende solo en esa instalación (nivel 3 de ADR 0019).

### 3.5 Salida del cliente

1. Aviso con 30 días.
2. Entrega **gratuita, una vez**, de la **exportación completa**: CSV por tabla (reservas, huéspedes, finanzas, tarifas) +
   fotos y comprobantes + el calendario iCal (SD-1108). En 15 días.
3. Opcional y pagado (S/ 600): **traspaso** del proyecto Supabase y del proyecto Vercel a las cuentas del cliente, con el
   dominio apuntando igual. Sin código fuente: el sistema sigue funcionando mientras la licencia siga vigente (contrato:
   licencia de uso mientras se pague el mantenimiento *o* se pague la tarifa de licencia anual; D16).
4. Se borran los datos personales en la fecha pactada y se entrega constancia.

## 4. Marketing y venta sin pagar al inicio

### 4.1 A quién le vendes

Anfitriones de Airbnb/Booking en **Cusco y el Valle Sagrado** (Urubamba, Ollantaytambo, Pisac, Calca, Cusco ciudad) con
1 a 5 propiedades, que hoy: responden WhatsApp a mano, llevan el calendario en una hoja, dependen de Airbnb y pagan 15 % de
comisión. **Cliente ideal**: dueño que ya recibe huéspedes repetidos o referidos y tiene fotos decentes. **No vendas a**:
quien no tiene Airbnb activo (no sabe qué ahorra) ni a quien quiere precio mínimo (no valora el soporte).

### 4.2 Propuesta de valor (una frase)

> «Tu propia web de reservas, con calendario sincronizado con Airbnb, para que los huéspedes que ya te conocen te reserven
> directo y no le pagues comisión a nadie.»

Tres pruebas: **Saywa Lodges** (caso real), **demo** (sitio de ejemplo + panel por solicitud) y **cálculo de ahorro** con sus
cifras.

### 4.3 Saywa Lodges como caso de éxito

Solo cuando haya datos reales (no antes de la primera reserva directa): foto de las casas, reservas directas del primer mes,
ahorro frente a Airbnb, tiempo ahorrado en WhatsApp y una frase tuya. Ningún número sin aprobación del dueño (SD-1111).
Mientras no haya cifras, el caso es: «yo lo uso en mi propio alojamiento» + capturas del panel con datos ficticios.

### 4.4 Web de ventas y demo

Ya existen: web de ventas (`SD-1110`, `SD-1111`, `SD-1113`), botón «Ver sitio de ejemplo» y acceso al panel de la demo por
solicitud (`SD-1114`). Falta, en orden: (1) **comprar el dominio** `hoststay.app` (D8) y publicarla con SEO (SD-1112);
(2) medir visitas, clics a WhatsApp y solicitudes de demo sin cookies de terceros (SD-1413); (3) dar vida a la demo
(`SD-1115`: sitio demo que atrae reservas); (4) una página «Caso Saywa Lodges» con cifras aprobadas.

### 4.5 Contenido gratuito (3 horas por semana)

Un solo contenido, tres formatos. Todo sale de tu propio alojamiento y de la demo.

| Canal | Formato | Frecuencia | Ejemplos |
|---|---|---|---|
| Instagram Reels / TikTok | 20–40 s, texto en pantalla, sin hablar | 3 por semana | «Cuánto pagas a Airbnb en un año»; «Cómo bloqueo fechas en 10 segundos»; «Mi calendario único con Airbnb y Booking»; «Así reservan directo mis huéspedes» |
| LinkedIn | Texto + captura, 1 por semana | 1 por semana | Lecciones de montar un sistema propio; cifras reales de Saywa Lodges; conexión con dueños de hoteles y agencias |
| Grupos de Facebook y WhatsApp de anfitriones | Responder dudas y compartir una guía útil, **sin spam** | Diario, 15 min | «Cómo evitar doble reserva», «Qué datos pide SUNAT a quien alquila», «Plantilla de mensajes de bienvenida» |
| Web (SEO) | Artículos largos, 1 al mes | Mensual | «Sistema de reservas para Airbnb en Perú», «Cómo tener reservas directas en el Valle Sagrado» |
| Google Business Profile de HostStay y de Saywa Lodges | Fotos y reseñas | Semanal | Pide una reseña a cada huésped |

Herramientas gratuitas: Canva (diseño), CapCut (edición), Metricool plan gratuito (programar, D11), Google Business. El
estudio de contenido con IA del panel (SD-1203) llega después; no lo esperes.

### 4.6 Embudo y metas realistas

| Etapa | Meta por semana | Cómo |
|---|---|---|
| 1 · Descubrir | 10 conversaciones nuevas con anfitriones | Mensajes directos a anfitriones de la zona, referidos de Saywa Lodges, grupos, comentarios en Reels |
| 2 · Interés | 3 solicitudes de demo | Botón «Solicitar demo» en la web y en la biografía |
| 3 · Demo | 2 demos de 20 minutos | Guion 4.8 |
| 4 · Proforma | 1 proforma enviada | Plantilla con la proforma por plan (SD-1411) |
| 5 · Cierre | 1 cierre cada 3–4 semanas al inicio | Seguimiento al día 2 y al día 7 |

Meta de 90 días: **3 clientes de pago** (además de Saywa Lodges). **Lanzamiento piloto:** a los 3 primeros, 30 % de descuento
en la instalación a cambio de un caso de éxito, permiso para usar capturas y una reseña (D19).

### 4.7 Cuándo pagar anuncios

**No antes de**: (1) 3 clientes que pagan; (2) la web de ventas mide solicitudes (SD-1413) y se conoce el costo por demo
orgánica; (3) una página de caso real con cifras. Entonces, **presupuesto de prueba de S/ 300/mes** en Meta Ads (Instagram)
dirigido a anfitriones de Cusco, con el objetivo «mensajes de WhatsApp». Se corta si en 30 días el costo por demo supera
S/ 120 (≈ 7 % del primer cobro de un plan Esencial). Google Ads de búsqueda («sistema de reservas Airbnb Perú») solo cuando
la web de ventas tenga 3 artículos SEO.

### 4.8 Guion de demo (20 minutos)

1. **Minutos 0–3 · Su dolor.** «¿Cuántas reservas te llegan por Airbnb, cuántas por WhatsApp? ¿Cuánto pagaste de comisión
   el año pasado?». Anota la cifra.
2. **3–7 · El sitio.** Abre la web de ejemplo en el celular. Elige fechas, mira el precio, reserva con comprobante.
3. **7–12 · El panel.** Calendario único (bloqueos de Airbnb en gris), «Hoy» (llegadas y salidas), bloquear fechas y cambiar
   precio de un rango en 10 segundos.
4. **12–15 · Dinero.** Finanzas: ingreso por casa, comisión de plataforma, ahorro en directo (si ya existe SD-1205).
5. **15–18 · Mensajes y guía.** Mensaje de bienvenida listo para enviar; guía privada con inventario.
6. **18–20 · Cierre.** «Con tus números, 2 reservas directas al mes pagan el plan». Pide permiso para enviar la proforma hoy.

### 4.9 Objeciones y respuestas

| Objeción | Respuesta |
|---|---|
| «Ya tengo Airbnb, no necesito más» | «Airbnb sigue; esto es para los huéspedes que ya te conocen o te encuentran en Google y hoy te pagan comisión. El calendario se sincroniza, no duplicas trabajo» |
| «Es caro» | Enseña su comisión anual. «Con 2 reservas directas al mes se paga». Ofrece Esencial |
| «No sé de tecnología» | «Tú solo usas el celular. Yo instalo, cargo tus datos y te enseño; hay videos cortos para cada tarea» |
| «¿Y si se cae o te vas?» | «Monitoreo cada hora, respaldos diarios y exportación de todos tus datos cuando quieras. El dominio es tuyo» |
| «¿Y si el huésped no confía en pagar directo?» | «Pagan por Yape/transferencia con comprobante, ven tu web con fotos y reseñas y tu WhatsApp. Puedes usar pago en línea en el plan A medida» |
| «Wix/Booking engines por 20 USD» | «Esos no sincronizan con Airbnb ni llevan tus finanzas ni mensajes por WhatsApp. Aquí es una sola herramienta hecha para anfitriones peruanos» |
| «No tengo tiempo para cargar todo» | «Importo tus casas, tarifas e historial de Airbnb por ti en la instalación» |
| «Voy a pensarlo» | «¿Qué falta para decidir? Te envío la proforma hoy y te escribo el jueves» |

## 5. Tutoriales

### 5.1 Recomendación de formato

**Serie de videos cortos, uno por tarea (1–3 minutos), con texto en pantalla y subtítulos; voz IA opcional; más una guía
escrita con capturas dentro del panel.** No grabes tu voz si no quieres.

Por qué **no** un video largo único:

- Nadie lo ve completo; el cliente busca *una* respuesta («¿cómo bloqueo fechas?») y no la encuentra en 40 minutos.
- Cada cambio del panel invalida el video entero; con videos cortos regrabas solo el capítulo afectado (≈ 15 min).
- Los largos se perciben «profesionales» solo en webinars; en producto, lo profesional es que **se encuentre rápido** lo que
  se busca, con título claro, capítulos y una guía escrita al lado.
- Un video largo está bien **una sola vez**: la capacitación inicial grabada por videollamada (2 h), para el cliente.

### 5.2 Herramientas (todas con plan gratuito o muy barato)

| Necesidad | Herramienta | Nota |
|---|---|---|
| Grabar pantalla | OBS Studio (gratis) o la grabadora del Mac (`Cmd+Shift+5`) | Usa la **demo**, nunca datos de un cliente |
| Edición, zoom, subtítulos automáticos | CapCut o Descript (plan gratuito) | Subtítulos en español y, si quieres, inglés |
| Voz IA (opcional) | ElevenLabs, el narrador de CapCut o Descript Overdub | Voz neutra en español; revisa pronunciación. **No clones la voz de otra persona sin permiso** |
| Capturas anotadas | CleanShot X o la herramienta de capturas del Mac + Canva | Para la guía escrita |
| Alojamiento | **YouTube «no listado»** (gratis, sin límite de videos) | Un enlace por capítulo; lista de reproducción privada por producto |
| Guion | Un archivo Markdown por capítulo en `docs/ayuda/` (lo escribe Codex, SD-1420) | Texto = subtítulos = guía escrita (una sola fuente) |

El vídeo no listado se puede compartir con quien tenga el enlace; **no lo uses con datos reales ni contraseñas visibles**.
Si el cliente exige privacidad total: Vimeo con dominio restringido o archivos descargables.

### 5.3 Estructura de cada video

1. Título que es una pregunta del cliente: «Cómo bloquear fechas».
2. 5 s: qué verás. 3. Pasos con **cursor resaltado y texto en pantalla** («1. Toca el día de inicio»). 4. 5 s de cierre y
siguiente video relacionado. Sin música fuerte; ritmo lento; 1080p vertical (9:16) **y** horizontal solo si lo vas a
reutilizar como Reel.

### 5.4 Lista de capítulos (según las pantallas reales del panel)

Cada capítulo corresponde a una ruta de `app/app`. Los 14 primeros se graban primero (es lo que el cliente usa a diario).

| # | Capítulo | Pantalla | Dur. |
|---|---|---|---|
| 1 | Entrar al panel y recorrido general | `/login`, inicio | 2 min |
| 2 | **Hoy**: llegadas, salidas y pendientes | inicio | 2 min |
| 3 | Calendario: ver, bloquear y desbloquear fechas | `/calendar` | 2 min |
| 4 | Cambiar el precio de unas fechas | `/calendar` (rango) | 2 min |
| 5 | Conectar Airbnb y Booking (importar y exportar iCal) | `/calendar/feeds` | 3 min |
| 6 | Crear una cotización y enviarla por WhatsApp | `/quotes` | 2 min |
| 7 | Revisar un comprobante y aprobar la reserva | `/bookings/[id]` | 3 min |
| 8 | Reserva manual y pago del saldo | `/bookings/nueva` | 2 min |
| 9 | Cancelar una reserva | `/bookings/[id]` | 1 min |
| 10 | Ver y completar los datos de una estadía (nombre, llegada, pedidos) | `/bookings`, `/calendar` | 2 min |
| 11 | Mensajes listos para enviar (bienvenida, check-in, check-out) | `/settings/messages` | 2 min |
| 12 | Tarifas y temporadas: precio base, fechas especiales | `/rates`, `/rates/simulator` | 3 min |
| 13 | Registrar ingresos y gastos | `/finance`, `/finance/new` | 2 min |
| 14 | Reportes y Excel para el contador | `/finance/reports` | 2 min |
| 15 | Importar historial de Airbnb y gastos desde Excel | `/finance/importar`, `/finance/importar-movimientos` | 3 min |
| 16 | Gastos que se repiten | `/finance/recurring` | 1 min |
| 17 | Casas: fotos, descripción y publicar | `/site/units`, `/site/photos`, `/site/spaces` | 3 min |
| 18 | Apariencia del sitio: colores, logo, video de portada | `/site/appearance` | 3 min |
| 19 | Servicios, distancias y textos | `/site/amenities`, `/site/distances` | 2 min |
| 20 | Inventario de la casa y hoja para imprimir | `/site/inventory` | 2 min |
| 21 | Guía privada del huésped: crear enlace, contraseña y PDF | `/site/guide` | 3 min |
| 22 | Personal (staff) y permisos | `/settings` | 2 min |
| 23 | Cuentas de cobro (Yape, transferencia) | `/settings` | 2 min |
| 24 | WhatsApp: activar plantillas y reglas | `/settings/whatsapp`, `/whatsapp` | 3 min |
| 25 | Huéspedes | `/guests` | 1 min |
| 26 | Qué hacer si algo falla y cómo pedir ayuda | Ayuda | 1 min |

**Orden de producción:** capítulos 1–7 y 26 en la semana 3 (los que sostienen la primera venta y la demo); 8–16 en la
semana 4; el resto cuando exista el cliente piloto. Cada capítulo = un archivo `docs/ayuda/NN-slug.md` con guion, pasos y
capturas.

### 5.5 Cómo se entregan

- **Página de Ayuda dentro del panel** (`/app/ayuda`, SD-1421, módulo apagable): lista por tema con buscador, video
  incrustado de YouTube no listado y guía escrita con capturas debajo. Lo escribe Codex a partir de los archivos
  Markdown, sin dependencias nuevas.
- Un enlace «¿Cómo se hace?» en cada pantalla que abre el capítulo correspondiente.
- **Correo de bienvenida** con la lista de reproducción y el formulario de soporte.
- **Control de versiones:** cada capítulo lleva «Actualizado para v1.2.0»; al cambiar una pantalla, el ticket incluye regrabar su
  capítulo. Un chequeo manual por trimestre.
- Versión en inglés: solo subtítulos (los textos ya son bilingües); no regrabes.

## 6. Pendientes de Saywa Lodges para darlo por terminado

Saywa Lodges es la instalación n.º 1 y el caso de éxito: hasta que esté bien cerrada **no se vende con confianza**.
Estado leído hoy; el detalle de pasos del dueño está en [`lanzamiento-saywa-lodges.md`](lanzamiento-saywa-lodges.md).

| # | Pendiente | Estado | Quién | Ticket |
|---|---|---|---|---|
| 1 | Supabase Pro + backups + protección de contraseñas filtradas | Falta | Dueño | SD-1409 |
| 2 | Correo (Resend verificado + variables) y cron `booking-emails` en verde | **Falla hoy** | Dueño + Claude | SD-1401 |
| 3 | Host `app.<dominio>` configurado en Vercel y Supabase Auth | Falta (el panel vive en `.vercel.app`) | Dueño | SD-1440 |
| 4 | Texto legal de reserva (D1), cuentas de pago, páginas legales | Falta | Dueño + Codex | SD-1105 |
| 5 | **Lote 2**: reserva de prueba controlada de punta a punta | Falta | Dueño | SD-1440 |
| 6 | **Lote 12 · inventario**: SD-1301 y SD-1302 hechos; faltan SD-1303 (hoja imprimible), SD-1304 (inventario en la guía), SD-1305 (control al check-out) | En curso | Codex / Claude | SD-1303–1305 |
| 7 | Datos y fotos de las casas (Villa completa, Casa 1, Casa 2): descripciones es/en, camas, tarifas, fechas especiales | Pendiente del dueño | Dueño | SD-1441 |
| 8 | Respaldo propio (SD-1122, PR #140 abierto; Supabase free no tiene backups descargables) | En curso | Claude | SD-1122 |
| 9 | CSP verificado en Preview (SD-701) antes de promocionar | Falta | Dueño | SD-701 |
| 10 | Go-live: publicar casas, probar en móvil `/es` y `/en`, avisar a los primeros huéspedes | Después de 1–5 | Dueño | SD-1440 |
| 11 | **Reseñas**: Google Business Profile de Saywa Lodges + reseña pedida a cada huésped (mensaje de post-estadía en la biblioteca, SD-1130) | Falta | Dueño | SD-1442 |
| 12 | **Redes**: Instagram profesional, TikTok y Facebook de Saywa Lodges con el enlace de reserva; enlaces con origen (SD-1201/1202 después) | Falta | Dueño | SD-1442 |
| 13 | WhatsApp: verificar negocio en Meta (D5) y plantillas aprobadas | Falta (tarda semanas) | Dueño | SD-1009 |

**Definición de «terminado»:** (a) una reserva real pagada por el sistema; (b) correos, calendario y respaldos funcionando
una semana seguida sin alertas; (c) 3 reseñas en Google y 10 fotos en Instagram; (d) inventario impreso en una casa.
Con eso se arma el caso de éxito (sección 4.3).

## 7. Qué falta para vender

### 7.1 Legal (Perú)

| Tema | Qué se necesita | Quién | Ticket |
|---|---|---|---|
| Términos de reserva y cancelación de **cada cliente** | Texto del cliente; el sistema solo lo muestra y versiona (D1) | Cliente + abogado | SD-1105 |
| Política de privacidad (Ley 29733) | Página editable por el cliente; plantilla base del vendedor; registro del banco de datos si corresponde | Abogado | SD-1105 |
| **Libro de Reclamaciones virtual** | Obligatorio para establecimientos abiertos al público; formulario público con constancia por correo y bandeja en el panel | Codex + validación legal | SD-1105 |
| Contrato de licencia y mantenimiento v2 | Sección 3 de este plan | Abogado | SD-1410 |
| Términos y privacidad de **HostStay** (web de ventas y formulario) | Política que cubra datos de prospectos | Abogado | SD-1410 |
| Marca HostStay | Búsqueda de antecedentes en INDECOPI, luego registro de la marca (≈ S/ 535 por clase) | Dueño | D7 |
| Consentimiento de WhatsApp (D12) | Texto validado antes de publicidad | Dueño/abogado | D12 |

### 7.2 Facturación y SUNAT

- Necesitas **RUC** (persona natural con negocio o EIRL/SAC) y un régimen que te permita **facturas** (el Nuevo RUS solo emite
  boletas, y muchos alojamientos con RUC piden factura). Régimen Especial (RER) o Régimen MYPE Tributario. **Consúltalo con un
  contador antes de la primera venta**; no es opcional (D17).
- Emisión: el sistema gratuito de SUNAT («SOL» → emisión electrónica) alcanza para pocos comprobantes mensuales; con más
  volumen, un facilitador (Nubefact, Facturalo) por unos S/ 40–80 al mes. Conviene **no** construirlo dentro de HostStay:
  comprobantes electrónicos están fuera de alcance (`plan-comercial.md`).
- Cobros: transferencia/Yape a tu cuenta personal o empresarial; guarda cada pago con su factura. **IGV 18 %** se suma si estás
  afecto.
- Aparte, la **facturación de cada cliente a sus huéspedes** (boletas o facturas por el alquiler) es del cliente: HostStay
  exporta los datos para su contador (Excel, SD-805) pero no emite comprobantes; se ofrece como trabajo a medida.

### 7.3 Backups y continuidad

Supabase Pro da backups diarios (7 días) y no incluye los archivos de Storage; ya hay un plan para volcar BD y Storage de
forma cifrada (SD-1122). Falta: **prueba de restauración trimestral por instalación** (`produccion.md`) y guardar la copia
**fuera** de las cuentas del proveedor. Exportación completa por cliente: SD-1108.

### 7.4 Monitoreo

Hoy hay `Installation health` cada hora y logs de Vercel. Falta: que un cron fallido **avise de verdad** (correo/WhatsApp) sin
ahogarte en rojos (SD-1401); un chequeo de disponibilidad externo gratuito (UptimeRobot o Better Stack sobre `/es` y
`/api/health`, SD-1432); y el registro de auditoría (SD-605) para poder responder «quién cambió esto».

### 7.5 Onboarding por instalación y documentación

Cada instalación sigue un único **checklist de incorporación** (SD-1431), en el que cada paso dice «qué, quién, cómo verificarlo»:

1. Contrato firmado y primer pago (50 %).
2. Cliente compra o transfiere el dominio; tú configuras DNS (runbook paso 5).
3. Alta técnica con `npm run install-client` (30–45 min; `runbook-instalacion.md`).
4. Carga de casas, tarifas, fotos e historial; cliente aprueba textos legales.
5. Resend verificado, cuentas de pago, iCal conectado a Airbnb/Booking, crons en verde, *Installation health* «healthy».
6. Reserva de prueba controlada y cancelación.
7. Capacitación (2 h grabada) + enlace a tutoriales.
8. Acta de entrega y segundo pago (50 %).
9. Día 7, 30 y 90: llamada corta de seguimiento (el día 90 termina la garantía y empieza el mantenimiento).

Documentación faltante: manual del cliente (SD-1106), ayuda en el panel (SD-1421), plantillas de incidencia, proforma
(SD-1411), guion de demo (esta sección 4.8) y el runbook de salida (sección 3.5).

## 8. Orden de trabajo: próximas 4 semanas

Una persona; 3 tickets en curso como máximo (regla de `cola.md`). **Semana = lunes a domingo desde el 2026-11-30**
(esta semana se cierra el PR del plan y se arrancan los pasos del dueño).

| Semana | Objetivo | Tareas del dueño | Tickets del agente |
|---|---|---|---|
| **1** (30-nov → 6-dic) | **Desbloquear la primera reserva real** | Pasar Supabase a Pro en una organización nueva; variables de Resend en Vercel; host `app.`; texto legal D1; cuenta de pago | SD-1401, SD-1402, SD-1406, SD-1403 (#149), SD-1404 (mergear release 1.1.0) |
| **2** (7 → 13-dic) | **Reserva de prueba y respaldos** | Reserva de prueba controlada (`lanzamiento-saywa-lodges.md` C); iniciar verificación de Meta (D5); fotos y textos de las casas; contador (D17) | SD-1122 (backup), SD-1303 (hoja imprimible), SD-1105 (páginas legales y Libro), SD-1405, SD-1407 |
| **3** (14 → 20-dic) | **Preparar la venta** | Comprar `hoststay.app` (D8); decidir precios (D15); grabar videos 1–7; abrir Instagram/TikTok/Google; primeras 10 conversaciones | SD-1410 (contrato v2), SD-1411 (proforma), SD-1112 (SEO), SD-1413 (medición), SD-1420 (guiones), SD-1304 |
| **4** (21 → 27-dic) | **Primeras demos y cierre de Saywa Lodges** | Abogado revisa el contrato; 5 demos; enviar 2 proformas; pedir reseñas a huéspedes; grabar videos 8–16 | SD-1421 (Ayuda en el panel), SD-1431 (checklist de incorporación), SD-1432 (monitoreo), SD-1305, SD-1442 |

Nota de temporada: diciembre y enero son temporada alta del Valle Sagrado: los anfitriones están ocupados y les interesa
más una solución antes de **abril–junio** (reservas de junio-agosto). Haz las demos en las mañanas y deja los cierres
grandes para enero–febrero; usa diciembre para dejar Saywa Lodges impecable y juntar cifras reales.

**Lo que no se hace en estas 4 semanas:** Mercado Pago (lote 4), CRM, estudio de contenido con IA, anuncios, o
automatizaciones nuevas de WhatsApp. Ninguna es necesaria para la primera venta.

## 9. Decisiones del dueño (con mi recomendación)

Se agregan a [`decisiones-pendientes.md`](decisiones-pendientes.md). Cada una se responde en una línea («D15: sí»).

| Id | Decisión | Recomendación | Bloquea |
|---|---|---|---|
| D14 | Quién paga la infraestructura | **Modelo A**: incluida en la mensualidad; el cliente se puede llevar su proyecto al salir (sección 2.2) | SD-1410, proforma |
| D15 | Precios | Esencial S/ 1.800 + 160/mes · Pro S/ 3.200 + 290/mes · A medida desde S/ 5.500 + 480/mes; por proforma, sin publicar (D4) | SD-1411 |
| D16 | Impago y salida | La escalera de la sección 2.6, exportación gratuita una vez, traspaso pagado S/ 600 | SD-1410 |
| D17 | RUC, régimen y facturación | **Consulta a un contador esta semana**; régimen que permita facturas; no construir emisión dentro del producto | Primera venta |
| D18 | Formato de tutoriales | Videos cortos con texto en pantalla y subtítulos; voz IA **sí** (revisando pronunciación); sin tu voz | SD-1420–SD-1422 |
| D19 | Precio de lanzamiento | 3 pilotos con 30 % de descuento en la instalación a cambio de caso y reseña | Venta |
| D20 | Anuncios | **No** hasta 3 clientes y medición; luego S/ 300/mes de prueba | — |
| D21 | Supabase Pro ahora, en una organización nueva | **Sí**, esta semana; los ~USD 35 al mes se recuperan con la primera mensualidad | Primera reserva real |

Decisiones previas que siguen abiertas y bloquean ventas: **D1** (texto legal), **D5** (verificación de Meta, empieza ya),
**D8** (comprar `hoststay.app`), **D10** (paquetes: con este plan, Esencial/Pro/A medida) y **D12** (consentimiento de WhatsApp).

## 10. Tickets nuevos de este plan

Detalle y criterios de aceptación en [`roadmap.md`](roadmap.md#fase-14--negocio-errores-y-venta-plan-2026-11-24); orden en
[`cola.md`](cola.md) (lotes 13 y 14).

| Ticket | Qué | Prio |
|---|---|---|
| SD-1401 | Cron `booking-emails` en 500 y workflow ruidoso | P0 |
| SD-1402 | Preview `hoststay` falla por variables | P1 |
| SD-1403 | Dependabot: #149 y mayores #70/#71/#72 | P2 |
| SD-1404 | Mergear release 1.1.0 y arreglar CI de release-please | P2 |
| SD-1405 | Archivos `… 2.*` duplicados | P3 |
| SD-1406 | Orden «BD antes que código» y lecturas que no rompen | P1 |
| SD-1407 | Rutas `%5C` dan 500 | P3 |
| SD-1408 | Documentar avisos de Supabase como intencionales | P3 |
| SD-1409 | Supabase Pro y organización nueva (dueño) | P1 |
| SD-1410 | Contrato v2 y textos legales de HostStay | P1 |
| SD-1411 | Plantilla de proforma y hoja de costos por instalación | P1 |
| SD-1412 | Paquete de venta: guion de demo, objeciones y 30 días de contenido | P2 |
| SD-1413 | Medición de la web de ventas sin cookies de terceros | P2 |
| SD-1420 | Guiones y guías escritas de 26 capítulos | P2 |
| SD-1421 | Página de Ayuda dentro del panel | P2 |
| SD-1422 | Grabar y publicar los videos (dueño) | P2 |
| SD-1430 | Guía de facturación y tributación (contador) | P1 |
| SD-1431 | Checklist de incorporación por instalación y acta de entrega | P2 |
| SD-1432 | Monitoreo externo y alertas de cron | P2 |
| SD-1440 | Cierre técnico de Saywa Lodges (host `app.`, reserva de prueba, go-live) | P1 |
| SD-1441 | Datos y fotos de las casas (dueño) | P1 |
| SD-1442 | Reseñas y redes de Saywa Lodges (dueño) | P2 |
