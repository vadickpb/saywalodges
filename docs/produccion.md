# Producción: checklist y runbook por instalación (SD-702)

Esta guía la ejecuta el dueño de Saywa Direct con el dueño del alojamiento. Una instalación tiene su propio proyecto Vercel y Supabase ([ADR 0010](adr/0010-installation-per-client.md)). Completar una copia privada de las listas **por instalación**; este documento no acredita que los pasos ya se hayan hecho. No publicar dominios de clientes, refs, datos de huéspedes, tokens ni capturas con secretos en este repositorio público.

`<dominio>` es el dominio raíz del cliente, sin protocolo ni `app.`; `<id>` es su id en [`deploy/installations.json`](../deploy/installations.json). Los textos entre `<…>` son marcadores que debes sustituir, nunca credenciales reales. Guarda valores y evidencias en tu gestor de contraseñas o registro privado. Los cambios de paneles, secretos y BD remota los hace el dueño; el agente prepara y revisa instrucciones.

## 1. Checklist de salida a producción

No aceptar reservas reales hasta completar estas casillas y la prueba de restauración. Si algo falla, anotar responsable y fecha de arreglo; no marcar SD-702 como terminado solo por tener esta guía.

### Dominios, acceso y despliegue

- [ ] Identificar en el registro privado: `<id>`, proyecto Vercel, proyecto Supabase, responsable del alojamiento y contacto de emergencia. Confirmar que ambos proyectos pertenecen a esa instalación.
- [ ] En Vercel → proyecto → Settings → Domains, añadir `<dominio>` y `app.<dominio>`. En el proveedor DNS copiar **los registros exactos que muestra Vercel**, sin asumir una IP fija. Esperar **Valid Configuration** en ambos. Si usas `www`, configurarlo como redirección al raíz, según [`runbook-instalacion.md`, paso 5](runbook-instalacion.md#5-dns-manual-en-el-proveedor-del-dominio).
- [ ] Abrir `https://<dominio>/es` y `https://app.<dominio>/login`: certificado válido, sin aviso de seguridad y sin bucles. Probar también `/en`. El raíz sirve el sitio; panel, autenticación y todas las API viven en `app.`. Un `/api/health` en el raíz debe dar 404. No usar el dominio automático de preview como sustituto de una prueba de ambos hosts.
- [ ] En Supabase → Authentication → URL Configuration, comprobar Site URL del panel y redirect `https://app.<dominio>/auth/callback`. Comprobar registro de usuarios nuevos desactivado y SMTP propio; probar `/forgot-password` hasta abrir `/update-password` y entrar como owner. Fuentes: [`runbook-instalacion.md`, pasos 4 y 9](runbook-instalacion.md).
- [ ] En GitHub comprobar el Environment de despliegue de esta instalación, con Required reviewers y rama permitida `main`. Seguir [`workflow.md`, despliegue a producción](workflow.md#despliegue-a-producción-la-única-parte-manual): aprobar **Deploy database**, esperar verde y comprobar la última versión en **Migrations after** y Supabase → Database → Migrations. No ejecutar migraciones remotas desde el agente.
- [ ] En Vercel → Deployments, abrir el despliegue de Production y comprobar commit y estado **Ready**. Tras cambiar variables: **Redeploy**, comprobar Ready y volver a probar las pantallas. No hacer push directo a `main` para provocar un despliegue.
- [ ] Desde el panel del alojamiento, cargar contenido, fotos, precios, cuenta de pago y publicar la propiedad. Hacer una reserva controlada: cotizar → reservar → subir comprobante → revisión del dueño → confirmación y correos. Anotar los identificadores en privado; no borrar la reserva de prueba para ocultarla, cancelarla con motivo si corresponde.

### Variables de Vercel: inventario completo

Fuente de nombres: [`.env.example`](../.env.example). Reglas efectivas: [`lib/env.ts`](../lib/env.ts), [`lib/email/config.ts`](../lib/email/config.ts), [`lib/whatsapp/config.ts`](../lib/whatsapp/config.ts) y [`cron.md`](cron.md). **Obligatoria** aquí significa necesaria para operar la instalación, aunque algunas variables no sean exigidas por el build. “Condicional” indica la función que la necesita. “No secreto” no significa que debas publicar los datos privados del cliente.

En Vercel → proyecto → Settings → Environment Variables, crear cada variable aplicable con alcance **Production**. Marcar los secretos como sensibles; nunca darles prefijo `NEXT_PUBLIC_`. No copiar valores de producción a Preview/Development. Verificar nombres y alcance, guardar y redesplegar; un cambio sin redeploy no actualiza el despliegue existente.

| Variable | ¿Secreto? | ¿Obligatoria en producción? / valor o comprobación |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | No, pública | Sí en instalación: `https://app.<dominio>`, sin barra final. Este valor prevalece sobre el ejemplo histórico del sitio público. |
| `SUPABASE_URL` | No; servidor | Sí. URL del proyecto de esta instalación. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Sí** | Sí. Clave privilegiada del mismo proyecto, nunca en el navegador. |
| `NEXT_PUBLIC_SUPABASE_URL` | No, pública | Sí. El mismo proyecto que `SUPABASE_URL`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No, pública por diseño | Sí. Clave anon del mismo proyecto; RLS protege los datos. |
| `ROOT_DOMAIN` | No; servidor | Sí. `<dominio>`, sin protocolo, puerto ni `app.`; nunca `localhost:3000` en producción. |
| `DEPLOYMENT_MODE` | No | Sí para este modelo: `installation`. Si falta, el modo por defecto es `platform`. |
| `RESEND_API_KEY` | **Sí** | Sí para entregar correos reales. Sin ella producción rechaza envíos, no simula. |
| `EMAIL_FROM` | No | Sí para correo: remitente válido de dominio verificado en Resend. |
| `EMAIL_REPLY_TO` | No | Opcional; si se define debe ser remitente válido. Probar una respuesta al correo. |
| `EMAIL_MODE` | No | Opcional: dejar sin definir o `resend`. `simulate` deshabilita los envíos en producción. |
| `EMAIL_BRAND_NAME` | No | Opcional; recomendado nombre del alojamiento. Sin valor: `Saywa Direct`. |
| `EMAIL_POWERED_BY` | No | Opcional: `true` añade el pie si la marca difiere de Saywa Direct. |
| `EMAIL_ALLOWED_RECIPIENTS` | No; lista privada | Solo pruebas no productivas: direcciones o `@dominio` separados por coma. Vacía impide entregas reales en preview; producción no aplica esa lista. |
| `EMAIL_TEST_SECRET` | **Sí** | Solo pruebas no productivas: mínimo 16 caracteres para `POST /api/email/test`; no habilita esa ruta en producción. |
| `EMAIL_ARRIVAL_DAYS` | No | Opcional: entero 0–30, por defecto 3 días, zona `America/Lima`. |
| `EMAIL_ARRIVAL_INSTRUCTIONS_ES` | Privado; tratar como **secreto** si contiene acceso | Condicional: 1–4000 caracteres reales para llegadas de reservas en español. Si falta, ese evento falla definitivamente. |
| `EMAIL_ARRIVAL_INSTRUCTIONS_EN` | Privado; tratar como **secreto** si contiene acceso | Condicional: igual para reservas en inglés. Configurar ambos si se ofrece el sitio bilingüe. |
| `CRON_SECRET` | **Sí** | Sí: mínimo 32 caracteres aleatorios; autentica todos los cron y se usa para límites de peticiones públicas. |
| `HEALTH_SECRET` | **Sí** | Sí: mínimo 32 caracteres, diferente de `CRON_SECRET`; autentica el monitor. |
| `DEMO_MODE` | No | No. Dejar sin definir en clientes reales; `true` solo identifica la demo. No reinicia datos por sí sola. |
| `WHATSAPP_ACCESS_TOKEN` | **Sí** | Condicional a WhatsApp real: token de System User de Meta. |
| `WHATSAPP_PHONE_NUMBER_ID` | No; servidor | Condicional a WhatsApp real: id numérico del teléfono en Meta. |
| `WHATSAPP_MODE` | No | Opcional: `live` para real; `simulate` solo fuera de producción. Sin credenciales producción no envía. |
| `WHATSAPP_API_VERSION` | No | Condicional a modo live: versión admitida de Graph API, sin valor por defecto. Confirmarla en Meta al activar, no copiar una versión antigua del ejemplo. |
| `WHATSAPP_APP_SECRET` | **Sí** | Condicional al webhook: mínimo 16 caracteres, firma los POST. |
| `WHATSAPP_VERIFY_TOKEN` | **Sí** | Condicional al webhook: mínimo 16 caracteres, handshake GET. |
| `CSP_REPORT_ONLY` | No | Solo validación Preview: `1`. Producción lo ignora; dejar sin definir o `0`. Ver sección 2. |

- [ ] Revisar todas las filas; anotar cuáles son condicionales y no se usan. No inventar credenciales de Mercado Pago: no están en `.env.example` ni hay integración aprobada en CSP ([ADR 0011](adr/0011-csp-and-security-headers.md)).
- [ ] Resend → Domains: dominio de `EMAIL_FROM` **Verified**; API key activa; correo de prueba real entregado al owner y a una dirección controlada de huésped. Verificar bandeja y Resend, no solo HTTP 200.
- [ ] Si WhatsApp está contratado, completar y probar el webhook `https://app.<dominio>/api/whatsapp/webhook` según [`whatsapp.md`](whatsapp.md). No dar por activadas plantillas ni consentimiento de SD-1009 por cargar credenciales.

### Cron: programación y prueba por instalación

Fuente: [`cron.md`](cron.md); rutas implementadas en [`app/api/cron`](../app/api/cron). El repo **no programa estos cuatro trabajos automáticamente** ni define `crons` en Vercel. El dueño debe configurarlos en un scheduler externo. Para una operación sencilla: cron-job.org → **Create cronjob** → URL de la tabla → Advanced → método **POST**, cabecera `Authorization` con valor `Bearer <CRON_SECRET>` → intervalo indicado → guardar. Guardar la cabecera en privado, no en la URL. Configurar alertas por fallo HTTP y por ausencia de ejecución; si el scheduler no inspecciona JSON, añadir una revisión/monitor que sí lo haga para los contadores de fallo.

| URL en modo instalación | Frecuencia | Evidencia de ejecución correcta |
|---|---|---|
| `https://app.<dominio>/api/cron/expire-holds` | Cada 15 minutos | HTTP 200, `{"expired":N}`. Los holds vencidos sin comprobante en revisión pasan a `expired`. |
| `https://app.<dominio>/api/cron/ical-sync` | Cada 15 minutos | HTTP 200 con contadores en la raíz del JSON (sin envoltorio `summary`); revisar `failed`, `deferred` y `alertsFailed`, además del estado de cada feed. |
| `https://app.<dominio>/api/cron/booking-emails` | Cada minuto | HTTP 200 con `summary.sent`, `failed`, `skipped`. Alertar también si `summary.failed > 0`. `sent` puede contar simulaciones fuera de producción. |
| `https://app.<dominio>/api/cron/voucher-purge` | Diaria | HTTP 200 con `selected`, `deleted` y log `cron.voucher_purge.completed`. Hasta 100 candidatos por pasada; si hay cola, aumentar frecuencia. |

- [ ] Confirmar migraciones aplicadas **antes** de activar los jobs. Usar **Run now** del scheduler y revisar código HTTP, cuerpo y hora de cada ruta; luego comprobar una segunda ejecución programada. Sin cabecera debe responder 401 vacío. No compartir el valor de la cabecera en capturas.
- [ ] Recordar que purga es una operación real: borra huérfanos de más de 24 h y candidatos rechazados/expirados/cancelados tras 30 días, pero nunca comprobantes asociados a pagos `approved` o `pending_review`. La propuesta de cinco años **no** está activada. Revisar la política de [`cron.md`](cron.md#política-implementada) antes de habilitarla.
- [ ] Para iCal, comprobar un feed real y sus conflictos: HTTP 200 no garantiza que todos los feeds funcionen. No sustituir la programación HTTP de los demás cron por `pg_cron` que solo llame `expire_holds()`.

La demo tiene además un reinicio nocturno separado, descrito en [`demo.md`](demo.md); no programarlo para clientes reales. El monitor horario siguiente tampoco sustituye estos cuatro trabajos.

### Monitoreo activo: Installation health

- [ ] Seguir [`health.md`, configuración](health.md#configurar-una-instalación-pasos-exactos): GitHub → Settings → Environments → `health-<id>`, sin Required reviewers, ramas permitidas solo `main`. Secretos del Environment: `HEALTH_URL` = `https://app.<dominio>/api/health`, `HEALTH_SECRET` igual al de Vercel. Variable `INSTALLATION_ID` igual al id del registro. `HEALTH_URL` es secreto para no divulgar dominios en logs públicos; no es otra variable de Vercel.
- [ ] Actions → **Installation health** → Run workflow → rama `main`, campo `installation` = `<id>`. Ver **Installation <id>: healthy.** Un job verde con **NOT MONITORED** no cumple. Confirmar también la siguiente ejecución horaria: [`installation-health.yml`](../.github/workflows/installation-health.yml) usa `17 * * * *` (minuto 17 de cada hora, UTC; el scheduler puede retrasarse).
- [ ] Perfil de GitHub → Settings → Notifications → Actions → activar avisos de workflows fallidos. Probar una alerta cambiando **solo** `HEALTH_SECRET` en `health-<id>` a un valor de prueba, ejecutar manualmente y comprobar fallo 401 y correo; restaurar inmediatamente el secreto correcto y repetir hasta verde. No cambiar Vercel para esta prueba.
- [ ] Ante 503 revisar `problems`; ante 500 revisar logs. `holds_not_expiring` indica retraso >30 min; `ical_sync_stalled`, feed sin intento >1 h; desfase de migración >24 h genera alerta. **Límites:** sin feeds no se detecta un iCal parado; health no prueba entrega de correos, purga ni integridad de backups. Mantener sus alertas y pruebas separadas.

### Supabase Pro, backups y PITR

- [ ] Supabase → organización → Billing: comprobar plan **Pro** o superior y que el proyecto de esta instalación pertenece a esa organización. En el proyecto comprobar estado activo, sin aviso de pausa, y abrir el panel con datos. Guardar evidencia del plan y del proyecto, sin claves. El requisito de plan de pago por instalación viene del [ADR 0010](adr/0010-installation-per-client.md); no mantener producción en Free con riesgo de pausa.
- [ ] Proyecto → Database → Backups: comprobar un backup reciente completado y anotar fecha y zona horaria. Pro ofrece backups diarios con acceso a los últimos siete días. Si se contrata **PITR**, es un complemento de pago: comprobar su estado y el intervalo recuperable en **Point in Time**; sustituye a los backups diarios. Anotar si está activo o no y la pérdida de datos aceptada por el dueño: sin PITR puede ser hasta un día. [Fuente oficial de backups](https://supabase.com/docs/guides/platform/backups).
- [ ] Acordar y registrar quién guarda copia privada de archivos de Storage, su frecuencia y ubicación cifrada. El backup de BD no incluye los bytes de Storage: proteger todos los buckets utilizados: `property-photos`, `payment-vouchers`, `finance-receipts`, `house-guide-images`, `site-video-uploads` y `site-videos`, conservando rutas y permisos. Fuente de buckets: [`supabase/migrations`](../supabase/migrations); [límite oficial del backup](https://supabase.com/docs/guides/platform/backups). Sin copia de archivos no hay recuperación completa de fotos/comprobantes.
- [ ] Ejecutar la restauración aislada de la sección 3 y registrar el resultado de la sección 4. Una lista de backups en el panel no demuestra que se pueda recuperar el servicio.

## 2. Validación CSP en Preview (SD-701)

Fuentes: [ADR 0011](adr/0011-csp-and-security-headers.md), [`lib/security/csp.ts`](../lib/security/csp.ts) y [`proxy.ts`](../proxy.ts). Esta prueba pendiente incluye interacciones, no solo la carga inicial que prueba CI. No usar datos ni claves productivas.

1. Preparar un proyecto Vercel de pruebas y un Supabase de pruebas con propiedad publicada, owner y reservas ficticias. Los proyectos de cliente creados por el instalador tienen previews desactivados: usar el proyecto de pruebas o habilitarlos allí, no exponer la BD del cliente. Configurar hosts raíz y `app.` del entorno de ensayo según ADR 0010; si el preview automático no está reconocido por `ROOT_DOMAIN`, dará 404 y no validará el flujo. En Vercel → Settings → Domains asignar los dominios de ensayo a la rama de preview que se va a probar, y ajustar URL/redirect de Supabase de pruebas para esos hosts. Confirmar que el despliegue dice **Preview**, no Production.
2. Vercel → Settings → Environment Variables → añadir `CSP_REPORT_ONLY=1` con alcance **Preview**, preferiblemente restringido a la rama de prueba. Cargar las demás variables con valores de pruebas. Para correo real de ensayo, limitar `EMAIL_ALLOWED_RECIPIENTS` a direcciones tuyas; para pruebas sin correo usar `EMAIL_MODE=simulate`. Redeploy del preview; anotar URL, rama y commit.
3. En Chrome abrir herramientas de desarrollador (clic derecho → Inspeccionar). Network → recargar → seleccionar la petición del documento HTML → Response Headers: debe aparecer `Content-Security-Policy-Report-Only` con nonce. Si aparece solo `Content-Security-Policy`, revisar alcance y redeploy: no se está midiendo report-only. En Vercel Production (`VERCEL_ENV=production`) el flag se ignora siempre.
4. En Console activar **Preserve log**, mostrar todos los niveles y limpiar antes de cada recorrido. Usar un perfil sin extensiones. Abrir cada ruta desde la barra y también navegar con los botones del producto; recargar en cada host. Hacer el recorrido en español e inglés donde existen ambas versiones:

| Pantalla / ruta real | Acciones que deben funcionar sin violaciones CSP |
|---|---|
| Sitio público: `https://<dominio-pruebas>/es` y `/en` | Fotos, enlaces, selectores, calendario y widget de reserva. |
| Cotizar: `/es/cotizar`, `/en/cotizar` en sitio público | Cambiar fechas/huéspedes, validar errores, generar cotización. |
| Reservar: `/es/reservar/<token>`, `/en/reservar/<token>` en sitio público | Abrir el enlace generado, completar datos ficticios, enviar y ver resultado. |
| Estado/comprobante: `/es/reserva/<public_token>`, `/en/reserva/<public_token>` | Subir un archivo de prueba admitido y comprobar estado; probar validación de archivo inválido. Tokens solo de ensayo, no publicarlos. |
| Login: `https://app.<dominio-pruebas>/login` | Error de credenciales y acceso correcto contra Supabase de pruebas; cerrar sesión y entrar otra vez. |
| Dashboard: `https://app.<dominio-pruebas>/app` | Navegar, abrir `/app/bookings` y `/app/bookings/<id>`, revisar comprobante, aprobar/rechazar pagos ficticios; activar selects y notificaciones (toasts). |
| Ajustes: `https://app.<dominio-pruebas>/app/settings` y `/app/site` | Cambiar y guardar ajustes de prueba; abrir `/app/site/photos` y probar fotos/uploads y restaurar valores de ensayo. |

Rutas fuente: [`app/sites/[host]/[lang]`](../app/sites/[host]/[lang]), [`app/(platform)/login`](../app/(platform)/login), [`app/app`](../app/app). Los corchetes son carpetas internas, no se escriben en la URL pública.

5. Buscar mensajes **Content Security Policy**, **[Report Only]**, **Refused to…**, `violates`, con directivas como `script-src`, `style-src`, `connect-src`, `img-src` o `form-action`. Registrar pantalla, acción, directiva, origen bloqueado y commit; ocultar tokens/datos al compartir. Report-only permite continuar aunque una acción hubiera sido bloqueada: que la pantalla funcione no basta. Si hay hallazgos, el agente corrige la política/código mediante PR y se repite el recorrido; no añadir comodines para silenciar la consola.
6. Criterio de **sin violaciones**: cero mensajes CSP atribuibles a la aplicación durante todas las cargas, recargas e interacciones anteriores, en ambos hosts; todas las acciones esperadas funcionan y el header se verificó en cada host. No ignorar una infracción en una ruta válida. El ruido conocido de `/_not-found` para rutas inexistentes de plataforma está descrito en ADR 0011: anotarlo aparte, nunca usar una página 404 como evidencia de validación de una pantalla.
7. Guardar evidencia privada por pantalla (hora, navegador, commit, resultado), retirar `CSP_REPORT_ONLY` o poner `0` **en Preview**, redeploy y repetir el mismo recorrido. Ahora Network debe mostrar `Content-Security-Policy` aplicada, sin Report-Only, y Console seguir limpia. Solo después comunicar que la revisión manual de SD-701 está hecha; este documento no la da por ejecutada. Producción mantiene CSP aplicada en todo momento.

## 3. Runbook de incidentes

### Restaurar un backup: primero en otro proyecto

**Decisión del dueño:** punto a recuperar, pérdida de datos tolerable y momento de una posible intervención productiva. El agente no restaura ni ejecuta scripts con service-role de producción.

1. Abrir un registro privado: instalación, síntoma, hora del incidente con zona horaria, último momento sano y responsable. Elegir backup **anterior al incidente** o punto PITR disponible. No pulsar Restore sobre la BD productiva ni cambiar sus variables/DNS durante el ensayo.
2. Antes de clonar, pedir al responsable técnico una revisión de extensiones/tareas externas presentes en la copia: `pg_cron`, `pg_net`, webhooks y secretos de Vault pueden ejecutar llamadas al terminar un clon físico. El repo admite `pg_cron` como alternativa, así que no asumir que está vacío. Si no se puede demostrar que no habrá efectos externos, detener el clon físico y preparar con soporte una restauración lógica aislada; instrucciones oficiales de [restauración mediante CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). No desactivar tareas de producción solo para ensayar.
3. Si es seguro clonar: Supabase → **proyecto origen** → Database → Backups → **Restore to a New Project**. Elegir backup o instante PITR y revisar en la confirmación que se **crea un proyecto nuevo**. Revisar coste, confirmar y esperar a que termine. Registrar el ref nuevo en privado y comprobar que difiere del productivo. Esta función exige plan de pago y backups físicos; si no aparece, usar soporte y la restauración lógica anterior, nunca el botón de restauración del proyecto original como alternativa. [Guía oficial del clon](https://supabase.com/docs/guides/platform/clone-project).
4. En el proyecto nuevo configurar Auth/redirects solo de ensayo, registro de usuarios desactivado y claves propias. Revisar extensiones y tareas antes de conectar una app. El clon no copia toda la configuración ni archivos de Storage; reconstruir buckets/permisos y recuperar archivos de la copia privada, manteniendo nombres/rutas. Comprobar también que los enlaces de fotos restaurados no sigan leyendo Storage productivo. [Elementos que no copia el clon](https://supabase.com/docs/guides/platform/clone-project).
5. Crear un proyecto Vercel de ensayo. Antes de conectar datos reales restaurados, activar Vercel Authentication en Deployment Protection del proyecto de ensayo (opción All Deployments para cubrir también aliases; [guía de Vercel](https://vercel.com/docs/deployment-protection)) y comprobar que cubre **ambos dominios de ensayo**: en ventana incógnita, sin sesión Vercel, abrir raíz y panel y verificar que exigen acceso autorizado. Si algún alias deja entrar, no conectar la copia hasta protegerlo. Cargar sus cuatro variables Supabase contra **el proyecto nuevo**, hosts de ensayo y URLs de ensayo. Para datos reales restaurados, usar `EMAIL_MODE=simulate`, sin `RESEND_API_KEY`, y `WHATSAPP_MODE=simulate`, sin credenciales Meta, en un despliegue **Preview**. No programar `booking-emails`, iCal ni purga contra la copia. No usar un despliegue Production: allí simular está deshabilitado. No enviar recuperación de contraseña a huéspedes; usar una cuenta de prueba del responsable para el login.
6. Comparar el punto recuperado con el registro esperado: última migración y una muestra de reservas antes del corte, fechas/unidades, estados, pagos y membresías. Abrir fotos y un comprobante desde el panel autorizado. Comprobar que un usuario ajeno no accede al panel ni al comprobante. En la copia hacer una reserva ficticia y verificar que no se acepta otra de la misma unidad en fechas solapadas; cancelar la prueba con motivo. Anotar diferencias y tiempos. Si falta Storage o hay incoherencias, **ensayo fallido**, sin intervención productiva.
7. Si solo era prueba trimestral, cerrar con el registro de la sección 4. Si es incidente real, el dueño y el responsable técnico deciden un plan separado: ventana de mantenimiento, detener nuevas reservas por los canales afectados, pausar envíos/jobs, preservar una copia del estado actual y conciliar todas las reservas/pagos posteriores al punto recuperado. No reemplazar la BD perdiendo esas operaciones ni reemitir correos de una cola antigua sin cotejar Resend. El dueño aprueba explícitamente el proyecto destino y el cambio; los comandos se preparan para ese caso, no se improvisan desde esta guía.
8. Tras una recuperación aprobada, verificar sitio, login, reservas/pagos, Storage, cron y health; reanudar jobs uno por uno y vigilar duplicados/fallos. Registrar quién autorizó, pérdida real de datos, hora de recuperación y siguientes acciones. Si falla, mantener la ventana y escalar con soporte; no alternar entre dos bases que sigan aceptando reservas.

### Rotar secretos: orden y efectos

No pegar claves en chat, tickets, commits, comandos compartidos ni capturas. Crear valores aleatorios con `openssl rand -hex 32` para `CRON_SECRET` y `HEALTH_SECRET` por separado, guardarlos en el gestor privado. Antes de rotar, inventariar consumidores: Vercel Production, scheduler externo, GitHub Environment, SMTP y copias locales privadas como `.install/<slug>.state.json`. No sobrescribir esa copia con secretos en el repo.

Orden habitual: **crear reemplazo → actualizar consumidores → redeploy → probar → revocar anterior** si el proveedor permite solape. Si hay filtración, revocar cuanto antes aunque provoque corte; revisar accesos y registros desde la posible exposición. Rotar una familia por vez para poder identificar fallos.

| Secreto | Orden exacto del cambio del dueño | Qué falla durante el cambio / verificación |
|---|---|---|
| `CRON_SECRET` | Pausar los cuatro jobs HTTP en el scheduler; generar valor nuevo; Vercel Production → editar → redeploy Ready; actualizar cabecera de los cuatro jobs; ejecutar uno por uno y reanudar sus horarios. Actualizar copia privada del estado si existía. | La app acepta un único secreto: el anterior da 401 después del redeploy. Se retrasan expiraciones, correos, iCal y purga. Cambia también la clave HMAC de límites públicos: los contadores anteriores dejan de agrupar con los nuevos. Verificar 200 y contadores de cada job, no solo expire-holds. |
| `HEALTH_SECRET` | Generar uno distinto de cron; Vercel Production → editar → redeploy; GitHub → Environment `health-<id>` → secret del mismo nombre; ejecutar Installation health con `<id>`. | Puede haber alerta 401 entre ambos cambios; solo se pierde lectura de salud, no las reservas. Terminar con healthy y siguiente ejecución horaria verde. |
| `RESEND_API_KEY` | Resend → API Keys → crear nueva con permisos de envío para el dominio; Vercel → reemplazar → redeploy; si SMTP de Supabase usa esa key, actualizar también Authentication → SMTP Settings. Probar correo de reserva y recuperación de acceso con cuentas controladas; revisar entrega en Resend; revocar la anterior. | Con clave inválida fallan correos/alertas; si también era SMTP, falla recuperación de contraseña. Las reservas ya guardadas no desaparecen. Revisar fallos definitivos de la cola antes de reintentar. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys: identificar primero si es `service_role` JWT heredada o una clave secreta independiente. Crear reemplazo secreto en Settings → API Keys; ensayar su compatibilidad con el responsable técnico. Si se retira una heredada, preparar también reemplazo público para `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Actualizar Vercel y consumidores privados autorizados, rebuild/redeploy y probar sitio, login, cron, health y comprobantes. Después eliminar la secreta anterior o desactivar las claves legacy; si se filtró service-role legacy, revocar además el JWT secret heredado siguiendo la guía oficial. | Una clave secreta independiente puede admitir solape. La heredada está ligada al JWT secret: **no se rota de forma independiente**; cambiarlo puede afectar anon, sesiones y otros consumidores. Desactivar las claves legacy afecta también a anon; revocar su firma puede afectar sesiones. No asumir que el panel permite regenerar el JWT secret antiguo: preparar sustitución y revocación con la guía vigente, ensayo y nuevo login si corresponde. Clave privilegiada inválida afecta cron/health y operaciones privilegiadas. |
| `WHATSAPP_ACCESS_TOKEN` | Meta Business Settings → System Users → generar reemplazo con permisos del número; Vercel → actualizar → redeploy; probar con número autorizado según `whatsapp.md`; revocar anterior. | Los envíos WhatsApp fallan mientras la credencial sea inválida; no asumir que se reenvían solos. |
| `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | Coordinar ventana en Meta y Vercel: regenerar App secret o elegir Verify token, actualizar ambos extremos y redeploy; repetir verificación del webhook cuando cambie Verify token y prueba firmada según `whatsapp.md`. | El App secret desparejo invalida firmas POST; Verify token desparejo falla el handshake GET. Revisar entregas pendientes en Meta al terminar. |
| `EMAIL_TEST_SECRET` | Solo Preview: generar reemplazo, editar la variable y redeploy; actualizar el cliente de `POST /api/email/test`. | El secreto anterior deja de autorizar pruebas; no afecta producción. |
| `SUPABASE_DB_PASSWORD`, `SUPABASE_ACCESS_TOKEN` | Credenciales de despliegue, **no variables Vercel de `.env.example`**. Cambiar contraseña en Supabase o emitir token personal nuevo; actualizar secretos del Environment de despliegue indicado en `deploy/installations.json` y herramientas privadas del dueño; revocar token anterior tras verificar. | Afecta futuras migraciones/conexiones administrativas. Verificar configuración según `workflow.md`; Run workflow de Deploy database **aplica** pendientes, no es un test inocuo. Hacerlo solo cuando esas migraciones estén aprobadas. |

Para service-role, consultar las [claves oficiales de Supabase](https://supabase.com/docs/guides/api/api-keys) y su [guía de sustitución y revocación](https://supabase.com/docs/guides/security/rotate-leaked-api-keys); mantener los nombres de variables de este repo. Fuentes locales: [`lib/supabase/admin.ts`](../lib/supabase/admin.ts), [`.env.example`](../.env.example), [`health.md`](health.md), [`whatsapp.md`](whatsapp.md) y [`workflow.md`](workflow.md). Tras cualquier rotación anotar fecha, responsable, consumidores actualizados y pruebas; nunca anotar el valor en el registro del incidente.

### Incidente de doble reserva

1. Recoger aviso del huésped, canal externo o alerta iCal. En `https://app.<dominio>/app/bookings` abrir ambas reservas y comparar **unidad**, entrada y salida, estado y pagos, no solo nombres o fechas de creación. Revisar también el calendario y el canal de origen. La estancia es `[entrada, salida)`: una salida el mismo día de otra entrada no se solapa. Guardar ids y evidencia en privado.
2. El constraint `calendar_blocks_no_overlap` de [`20261028132649_calendar_blocks.sql`](../supabase/migrations/20261028132649_calendar_blocks.sql) impide bloques solapados por unidad; eso no garantiza que una OTA no haya vendido antes de sincronizar iCal. Si parecen existir dos reservas internas confirmadas con solape, escalar al responsable técnico para comprobar bloques/migraciones, sin desactivar el constraint ni editar tablas a mano. Revisar `ical_feeds`/conflictos según [`cron.md`](cron.md#cron-de-sincronización-ical-y-alertas-sd-307).
3. El **dueño del alojamiento** decide qué reserva mantener, reubicar o cancelar, y acuerda comunicación y reembolso con los huéspedes y el canal. El agente no decide prioridad por fecha/pago. Mientras se aclara, detener ventas de la unidad/fechas afectadas en cada canal por sus controles de disponibilidad; pedir asistencia si no se sabe cómo. No prometer disponibilidad basándose en una sincronización pendiente.
4. Para una reserva interna que el dueño decidió cancelar: owner → `/app/bookings/<id>` → escribir **Motivo (opcional)** con referencia privada al incidente → **Cancelar reserva** → confirmar **Cancelar reserva**. La acción usa `cancel_booking`; conserva la reserva y los registros de pago y libera su bloqueo. Los pagos `pending_review` pasan a `rejected`; los ya aprobados se mantienen aprobados. Si no aparece la acción o falla por estado, detenerse y pedir revisión, nunca borrar filas. Fuentes: [`booking-actions.tsx`](../components/dashboard/booking-actions.tsx), [`bookings/actions.ts`](../app/app/bookings/actions.ts) y [`lib/dal/bookings.ts`](../lib/dal/bookings.ts).
5. Cancelar/reubicar la reserva externa en su canal si esa fue la decisión; el panel no cancela una OTA por sí mismo. Registrar devolución real por el medio acordado: cancelar no equivale a devolver dinero ni borra pagos aprobados. No simular una devolución rechazando un pago ya aprobado. Para reubicación sin operación soportada, pedir un procedimiento revisado al responsable técnico.
6. Comprobar ambos expedientes, pagos, calendario interno y externo; ejecutar/supervisar iCal y revisar que no reaparece el conflicto. Reabrir ventas solo cuando coincidan. Cerrar registro con decisión del dueño, comunicaciones, devolución/reubicación, causa y prevención. No borrar reservas, pagos ni evidencias para hacer desaparecer el incidente.

### Si falla un cron o un correo

1. Abrir historial del scheduler y Vercel → proyecto → Logs, filtrar la ruta y hora. Guardar `x-request-id`, código y contadores, sin cabeceras ni PII. [`observability.md`](observability.md) explica la correlación de logs. Una ejecución que falta también es fallo: comprobar que el scheduler siga habilitado.
2. **401:** comprobar host `app.`, secreto de 32+ caracteres, cabecera Bearer y redeploy reciente. **404:** revisar host, `DEPLOYMENT_MODE` y URL exacta. **500:** revisar despliegue y migraciones/configuración; no repetir en bucle ni copiar errores internos al huésped. Si falla Deploy database, enviar enlace al agente como indica `workflow.md`. Corregir primero la causa.
3. Expiración: volver a ejecutar desde el scheduler y comprobar `expired`. Los vouchers en revisión se quedan para decisión del dueño. iCal: revisar `failed`, `alertsFailed`, `deferred` en la raíz del JSON y estado del feed; reparar URL/origen y observar la próxima pasada. `deferred` puede ser trabajo aplazado por límite de tiempo, no un fallo de todos los feeds. Purga: ante fallo Storage 500 revisar servicio/permisos, y reintentar tras corregir; las marcas permiten reintento idempotente. No borrar directamente `storage.objects` con SQL.
4. Correos: revisar Resend (entregado, rechazo, límite, dominio, key), `EMAIL_FROM`, `EMAIL_REPLY_TO` y las instrucciones del idioma si falla `arrival`. Mirar `cron.booking_emails.delivery`, `cron.booking_emails.settle_failed`, `cron.booking_emails.invalid_claim`, `cron.booking_emails.arrival_not_configured` y `cron.booking_emails.not_configured`. HTTP 200 con `summary.failed > 0` **no es éxito completo**.
5. Investigar eventos definitivos en Supabase → Table Editor → `booking_email_events` → filtro `outcome` igual a `failed`, con acceso administrativo del dueño. Leer `attempts`, `first_attempt_at`, `attempted_at`, `event`, `booking_id` y `payment_id` en privado. Fuente del contrato: [`20261105120000_booking_lifecycle_emails.sql`](../supabase/migrations/20261105120000_booking_lifecycle_emails.sql) y [`lib/dal/booking-emails.ts`](../lib/dal/booking-emails.ts). La tabla no es accesible a huéspedes ni miembros por la app; no relajar RLS para verla.
6. Fallos transitorios (`unavailable`, red, 429 o 5xx) se reabren hasta **tres intentos**. Un claim abandonado se recupera después de **30 minutos**, con el mismo tope. Fallos permanentes, instrucciones ausentes y agotamiento terminan `failed`: **otra llamada al cron no los reenvía**. Corregir configuración evita nuevos fallos, pero no resucita eventos definitivos.
7. Para cada `failed`, el dueño confirma con Resend si ya hubo entrega y decide si contactar manualmente al destinatario. Registrar solución fuera del ledger sin copiar datos al repo. Si se necesita reenvío automatizado, pedir al agente un procedimiento específico revisado que considere la clave de idempotencia, destinatarios fijados y ventana finita del proveedor. **No resetear `attempts`, `outcome` ni claims, no insertar eventos ni borrar filas manualmente**: puede duplicar comunicaciones. Tampoco repetir una aprobación/pago para provocar otro correo.
8. Cerrar solo tras una ejecución programada sana y la verificación de entrega real de un evento nuevo controlado, o documentar que no hubo eventos nuevos y cómo se vigilarán. Revisar `failed` pendientes por separado: que el siguiente cron tenga cero fallos no prueba que los anteriores se resolvieran.

## 4. Prueba trimestral de backup y registro

Cada tres meses **por instalación**, y también antes de una recuperación real, el dueño agenda y ejecuta la restauración aislada anterior con ayuda técnica. Crear un recordatorio privado al cerrar cada prueba; poner la próxima fecha a tres meses, responsable y suplente. Si vence sin prueba satisfactoria, registrar incidencia y priorizarla: no declarar backups probados ni aprobar una recuperación productiva sin ensayo.

1. Revisar plan, copia disponible, ventana PITR si contratada y copia privada de Storage. Elegir un punto anterior y registrar qué datos deberían existir allí.
2. Ejecutar pasos 1–6 de restauración **sin tocar producción**, medir desde el inicio hasta que se puedan consultar reservas y comprobantes. Probar login, aislamiento, disponibilidad y reserva ficticia en la copia; documentar diferencias respecto al punto elegido.
3. Clasificar **aprobado** solo si BD, Auth necesario, permisos, fotos y comprobantes recuperados funcionan y el tiempo/pérdida cumplen lo aceptado por el dueño. Falta de archivos, punto no recuperable o pruebas incompletas = **fallido**, con acción y fecha de repetición.
4. Guardar evidencias en un registro privado, no en este repo. Al terminar, el dueño retira acceso al ensayo y elimina desde los paneles los proyectos temporales que ya no necesite, verificando dos veces sus ids; conserva el proyecto productivo y las evidencias según su política. Registrar la limpieza y coste para evitar proyectos olvidados.

Plantilla para copiar al registro privado (sin valores secretos):

| Campo | Completar por prueba |
|---|---|
| Instalación / responsable / suplente | `<id>` / personas responsables |
| Fecha y zona horaria | Fecha/hora de ensayo y zona usada al elegir el punto |
| Proyecto origen y destino | Referencias privadas; confirmar que son distintos |
| Backup / PITR seleccionado | Fecha/hora, ventana disponible, motivo de elección |
| Archivos Storage | Ubicación cifrada, fecha de copia, buckets y muestra verificada |
| Objetivo aceptado | Máxima pérdida de datos y máximo tiempo sin servicio acordados |
| Inicio / fin / duración real | Incluir recuperación de archivos y verificación de la app |
| Datos esperados / obtenidos | Muestra de reservas, pagos, migración, fotos y comprobantes, sin PII innecesaria |
| Pruebas | Login, permisos, disponibilidad, rechazo de solape y ausencia de envíos externos |
| Resultado / diferencias | Aprobado o fallido; pérdida observada y límites del ensayo |
| Evidencias / autorización | Enlaces privados y quién verificó; el ensayo no autoriza cambiar producción |
| Acciones y repetición | Responsable y fecha por cada fallo |
| Limpieza / próxima prueba | Destinos temporales retirados y fecha dentro de tres meses |

Las actuaciones manuales de esta guía corresponden al dueño según [`guia-dueno.md`](guia-dueno.md) y [`workflow.md`](workflow.md). No hay cambios de producción implícitos por aprobar el PR documental.
