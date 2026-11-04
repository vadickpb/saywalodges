# Guía privada de la casa y video de portada

Fecha: 2026-11-04. Estado: implementado; PP-08 y PP-09. Despliegue de BD pendiente del workflow aprobado por el dueño.

## Guía privada

La guía vive en tablas independientes de `properties.content`, que es pública. Solo el dueño
puede editar, publicar y gestionar enlaces. Hay borrador y versión publicada, con contador
para rechazar ediciones concurrentes. No se implementa todavía historial de revisiones.
Las fotos son inmutables: quitarlas del borrador no borra imágenes de la publicación vigente.

El enlace contiene un token aleatorio de 256 bits; en BD solo se guarda su SHA-256. El dueño
elige contraseña y vencimiento (hasta un año), y copia el enlace una sola vez. No se incluye
la contraseña en la URL. PostgreSQL usa bcrypt con coste 10, salt aleatorio y límite de 72 bytes
para impedir truncación. La contraseña solo llega al RPC de creación/verificación.

`unlock_house_guide` serializa intentos por enlace: 10 fallos o 50 intentos totales por 15 minutos,
y máximo 100 sesiones activas. El límite por enlace puede bloquear temporalmente a otros
huéspedes; el dueño puede revocar y crear otro. No se ofrece identidad verificada ni impedir reenvíos.
Una cookie HttpOnly/SameSite contiene una sesión aleatoria de un día; solo el hash se persiste.
Cada lectura valida host, enlace, sesión, publicación, vencimiento y revocación en PostgreSQL.

Las imágenes están en un bucket privado. La ruta de descarga valida primero la cookie y la guía;
Storage vuelve a comprobar la sesión y que la imagen pertenezca a una sección visible publicada.
No hay URLs públicas ni enlaces firmados para fotos privadas, ni caché compartida ni optimizador
público de imágenes. Revocar impide nuevas lecturas, pero no recupera contenido ya descargado.
Se envía noindex y no-referrer. Se desactivan logs de argumentos de Server Functions y de rutas
`/guia/` en desarrollo; no se registran credenciales ni contenido privado desde la aplicación.

## Video de portada

Subida directa firmada a un bucket privado (evita el límite de cuerpo de Vercel), validación en
servidor de tamaño, cajas ISO-BMFF, duración, pista H.264 y ausencia de audio. Primera entrega:
clips escénicos sin audio de hasta 30 MB / 60 segundos / 3840 píxeles por eje. No hay transcodificación;
un archivo con metadatos correctos pero contenido corrupto puede fallar al reproducir y mostrar el poster.

El video verificado se copia a otro bucket privado e inmutable. La DAL usa service-role **solo**
para el RPC `register_verified_hero_video`: comprueba el owner de la sesión y registra la validación.
Ni páginas ni acciones importan ese cliente; no se usa para Storage ni consultas a tablas.
Un owner puede subir directamente un objeto, pero no registrarlo como verificado ni publicarlo.
La publicación exige un video verificado de su organización y una foto principal como poster.

Vista previa con cookie de owner. Ruta pública solo si ese video está seleccionado en esa
propiedad; Storage también comprueba esa selección. Las rutas soportan Range para avanzar
el video, no exponen credenciales y no cachean respuestas. Reproducción manual, sin autoplay,
con controles nativos y foto alternativa; funciona igualmente con movimiento reducido.
Volver a foto cierra la ruta pública del video. Los objetos previos se conservan; limpieza y cuotas
por almacenamiento total quedan para una entrega posterior, sin borrar recursos referenciados.

## Migración y verificación

Una entrega integrada PP-08/09 solicitada por el dueño, con una migración aditiva. No se cambia
ningún esquema existente ni se ejecuta contra producción desde el agente. Para revertir la
función, cambiar portada a foto y revocar enlaces; conservar datos/tablas para evitar pérdida.
El código conserva el sitio anterior si la migración aún no está aplicada.

Tests de dominio, credenciales, Range, pgTAP de aislamiento/RPC/Storage y prueba HTTP con datos
locales: login de owner, publicación, password, imágenes, revocación, upload firmado,
preview privado, publicación explícita y vuelta a foto. Se revisa también con dos organizaciones.
