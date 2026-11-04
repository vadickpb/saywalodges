# Usar la guía privada y el video de portada

## Guía de la casa

Como dueño, entra en **Sitio → Guía privada** (`/app/site/guide`). Añade las secciones que
necesites: llegada, reglas, estacionamiento, uso de equipos o contactos. Cada sección tiene
texto, pasos opcionales y hasta 12 fotos JPG/PNG/WebP de 4 MB con descripción accesible.
Puedes ordenar secciones, ocultarlas y ver una vista previa móvil.

**Guardar borrador** conserva los cambios sin mostrarlos a los huéspedes. **Publicar guía**
actualiza lo que ven todos los enlaces activos. Si otra ventana guardó primero, recarga antes
de editar para evitar sobrescribir. Quitar una foto de un borrador no borra su versión publicada.

En **Compartir con huéspedes**, indica un nombre para el enlace, una contraseña de al menos
12 caracteres (máximo 72 bytes UTF-8) y cuántos días será válido (1–365). Copia el enlace recién
creado: no se guarda una copia recuperable del token completo. Envía la contraseña por separado.
El huésped entra sin crear cuenta. Puedes compartir el mismo enlace con el grupo de la estancia.

**Revocar enlace** cierra también las sesiones que ya habían entrado y el acceso a sus imágenes.
Un huésped que haya descargado contenido puede conservarlo. Quien tenga enlace y contraseña
puede reenviarlos. El listado permite identificar y revocar enlaces; para reemplazar uno, crea otro.

Cada enlace admite hasta 10 contraseñas incorrectas o 50 intentos totales por 15 minutos y 100
sesiones activas. Si se bloquea, espera o revócalo y crea otro. No hay envío automático por WhatsApp.

## Video en portada

En **Sitio → Fotos**, elige primero una foto principal. En **Sitio → Apariencia**, selecciona
**Video** y sube un MP4 H.264 sin audio (hasta 60 segundos y 30 MB). El contenido se comprueba
en servidor; un archivo incompatible no se puede publicar. Un clip escénico exportado sin audio
funciona sin tener que preparar subtítulos. No se aceptan embeds externos ni HTML.

Revisa la vista previa y pulsa **Publicar portada**. El video permanece privado hasta publicarlo.
El visitante decide cuándo reproducir; no hay sonido ni autoplay. Si la reproducción falla,
queda visible la foto principal. Para retirarlo, elige **Foto** y publica de nuevo.

## Activación y pruebas

Migración: `20261104141337_private_house_guides_and_hero_video.sql`, aditiva. Producción se activa
con el workflow **Deploy database**, con aprobación del dueño según `docs/workflow.md`.
No exige nuevas variables de entorno. El cliente service-role existente se usa únicamente
para el RPC de registro de videos comprobados. No se aplica la migración remota desde el agente.

La verificación de esta entrega usa una instancia local separada (`saywa-private-guide-video`,
API `http://127.0.0.1:56321`) y servidor en el puerto 3200. No usa la base de producción.
Editor: `http://app.localhost:3200/app/site/guide` y
`http://app.localhost:3200/app/site/appearance`.
Cuenta de seed local: `owner@saywalodges.com`, contraseña `devpassword123` (solo entorno local).

Los recursos quitados se conservan para no romper versiones o enlaces. La limpieza de medios
huérfanos y las cuotas totales de almacenamiento quedan como mantenimiento posterior.
