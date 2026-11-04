# Plan complementario: web premium y CRM personalizable

Fecha: 2026-10-27. Estado: propuesta de alcance para incorporar al roadmap.
Este documento no implementa funciones ni cambia la prioridad del trabajo de Claude en SD-806.
Los identificadores PP son provisionales; asignar tickets SD libres al integrar el plan.
Actualización de alcance: 2026-11-04 — guía privada para huéspedes y videos en portada.
PP-08/09 implementados como entrega integrada; ver ADR 0018. Disponibilidad en producción pendiente del despliegue de BD.

## Resultado esperado

El dueño puede crear una web con identidad de hotel boutique, editarla sin programar y atender
consultas y huéspedes desde un CRM adaptado a su operación. Saywa es el primer caso real;
un segundo alojamiento debe poder usar las mismas funciones sin cambios de código.

Dos superficies relacionadas, con propósitos distintos:

- **Web pública**: fotografía, marca, experiencia y conversión a consulta o reserva.
- **CRM privado**: información clara, seguimiento rápido y control del acceso a datos.

El lujo se expresa con buenas fotografías, proporciones, espacio, tipografía y atención al detalle.
No exige dorado, animaciones continuas ni textos pequeños. La interfaz privada prioriza legibilidad
y velocidad de trabajo; no hereda automáticamente la composición editorial del sitio público.

## Base existente y relación con el roadmap

- Reutilizar SD-107 y `docs/design.md` para el dashboard.
- Reutilizar SD-201/202 para datos, fotos y contenido; SD-204 para unidades.
- Completar SD-208 para que las tarifas públicas salgan del modelo vigente.
- Ampliar SD-209/210: ya existen plantilla, presets, pares tipográficos y schemas de tema/contenido.
  No crear un segundo editor ni otra fuente de verdad para esos datos.
- Coordinar las fichas de huéspedes con SD-601 y las reservas con SD-401/406.
- Adelantar lo necesario de SD-605 para auditar publicación y cambios sensibles del CRM.
- SD-603/604 siguen siendo responsables del alta de tenants y dominios.

Antes de implementar, verificar el estado actualizado de estos tickets y sus dependencias.
Las propuestas de revisiones, campos personalizados y seguimiento requieren un ADR antes de migrar.

## Dirección visual

Ofrecer tres composiciones iniciales dentro del mismo sistema de componentes:

| Composición | Carácter | Recursos visuales |
|---|---|---|
| Refugio andino | Cálido, natural, sereno | Marfil, piedra, verde profundo; títulos editoriales; fotografía del entorno |
| Boutique contemporáneo | Sobrio, luminoso | Blanco cálido, carbón, acento tenue; composición limpia y fotografías amplias |
| Hacienda clásica | Acogedor, tradicional | Crema, terracota, madera; serif clásica y detalles discretos |

Estos nombres describen variantes de presentación, no nuevos productos. Mapearlas a los presets
existentes cuando sea posible. Empezar implementando una composición completa para Saywa.

Reglas comunes:

- Máximo dos familias tipográficas por composición y tamaños legibles en móvil.
- Escalas controladas de espaciado, radios y botones; evitar controles ilimitados por píxel.
- Fotos con punto focal editable para no cortar caras o elementos importantes en móvil.
- Jerarquía clara: un CTA principal por bloque, secundario de WhatsApp cuando corresponda.
- Contraste AA, foco visible, navegación por teclado y respeto de movimiento reducido.
- Sin carruseles automáticos ni video de fondo por defecto.
- Reseñas solo con contenido y procedencia reales; no inventar puntuaciones o testimonios.

## Editor de la web

Entrada única en **Sitio → Apariencia**, con cuatro áreas:

1. **Marca**: logo, preset, colores y par tipográfico; combinaciones legibles sugeridas.
2. **Secciones**: mostrar, ocultar y ordenar bloques compatibles; variantes prediseñadas de hero,
   galería y unidades. Mantener disponibles contacto y navegación esenciales.
3. **Contenido**: textos es/en, FAQ, fotos, video opcional de portada y enlaces; reutilizar los editores existentes.
4. **Vista previa y publicación**: móvil/escritorio, borrador, publicar y restaurar una versión.

Bloques iniciales: portada, presentación, unidades, galería, servicios, tarifas, ubicación, FAQ,
contacto y reseñas cuando exista una fuente. Experiencias y ofertas quedan para una segunda entrega.

### Reglas de publicación

- Guardar un borrador no modifica la web publicada.
- La vista previa de borradores requiere sesión y acceso a la organización; no se indexa ni se
  expone a través de consultas públicas. No implementar enlaces públicos de preview en la primera entrega.
- Publicar cambia atómicamente la revisión activa; registrar autor y fecha.
- Detectar edición concurrente mediante versión: avisar de un conflicto sin sobrescribir silenciosamente.
- Restaurar copia una revisión anterior a un nuevo borrador; no modifica reservas, tarifas ni finanzas.
- Versionar solo presentación y contenido editorial. Precios y disponibilidad siguen consultando sus
  fuentes operativas; mostrar esto claramente en la vista previa y en la restauración.
- Una revisión no debe perder imágenes por un borrado posterior: proteger referencias o definir una
  política explícita de retención antes de habilitar el historial.
- Configuración validada en servidor y BD cuando corresponda; sin HTML, CSS o JavaScript arbitrario.
- Owner publica y restaura; staff no administra la marca en la primera versión.

## Guía privada de la casa para huéspedes

El dueño configura una guía y comparte manualmente su enlace con las personas que elija,
por ejemplo mediante WhatsApp. El huésped abre el enlace e introduce una contraseña; no necesita
crear una cuenta. La guía no aparece en la navegación pública ni en buscadores.

### PP-08 · Guía privada configurable con acceso protegido

Estado: implementado; despliegue pendiente. Dependencias: autenticación y aislamiento por organización existentes,
gestión de contenido/Storage de SD-202; coordinar publicación con PP-03. Review: R+S.

- Editor por alojamiento con secciones que se pueden crear, ordenar, ocultar y editar: llegada,
  check-in/check-out, reglas de la casa, uso de equipos, Wi-Fi, estacionamiento, emergencias y contactos.
- Cada sección admite título, texto, pasos e imágenes opcionales con descripción y texto alternativo;
  por ejemplo, fotos que identifiquen la entrada o expliquen cómo usar un equipo. Vista previa móvil.
- Guardar borrador y publicar explícitamente; owner administra contenido y accesos. Reutilizar el
  editor y la publicación existentes donde corresponda, manteniendo estos datos fuera del sitio público.
- Generar enlaces aleatorios no enumerables, con contraseña por enlace, vencimiento y revocación.
  Permitir varios enlaces para la misma guía y copiar cada enlace para enviarlo manualmente;
  la contraseña se comunica por separado y nunca se incluye en la URL.
- Guardar contraseñas con hash seguro, limitar intentos y verificar acceso en servidor para cada
  recurso. La sesión del visitante caduca y deja de funcionar al vencer o revocar el enlace.
- Imágenes en almacenamiento privado y acceso temporal autorizado; no reutilizar URLs públicas
  para fotos de la guía. No exponer textos, imágenes ni credenciales en previews de WhatsApp,
  metadatos, logs, cachés compartidas, sitemap o respuestas previas a la autenticación.
- `noindex` complementa la protección, pero no reemplaza la contraseña ni la autorización.
  Explicar al dueño que quien reciba enlace y contraseña puede reenviarlos; no garantiza identidad.
- Primera entrega independiente de reservas: envío manual. La asociación a una estancia y el envío
  automático pueden ampliarse con SD-406/407 sin bloquear esta guía.

Criterios de aceptación: dueño publica reglas y pasos con fotos; huésped autorizado los consulta
desde móvil; contraseña incorrecta, enlace vencido o revocado deniegan contenido e imágenes;
otra organización no puede leer ni modificar la guía. Verificar límites de subida, aislamiento,
acceso directo a imágenes y revocación de sesiones. Definir la caducidad máxima de URLs firmadas
para acotar cualquier acceso residual tras revocar. Dividir esquema/acceso e interfaz antes de implementar.

## Video opcional en portada

### PP-09 · Portada configurable con foto o video

Estado: implementado; despliegue pendiente. Dependencias: SD-202, SD-209/210 y PP-03/04. Review: R+S.

- En Sitio → Apariencia, elegir foto o video para la portada y subir/reemplazar el video desde el editor.
  Configurar una imagen de portada alternativa (poster) y previsualizar móvil/escritorio antes de publicar.
- Mantener legibles el título y el botón principal sobre el recurso; conservar la foto como opción inicial.
- Reproducción manual por defecto, con controles accesibles. Si se ofrece reproducción automática
  como fondo, debe ser opcional, sin sonido, con pausa visible y desactivada con movimiento reducido.
- Mostrar el poster si el video falla, no es compatible o no se reproduce. Evitar descargar el video
  completo antes de que haga falta; definir formatos, peso y duración máximos antes de implementar.
- Validar archivos en servidor, aplicar permisos por organización y conservar recursos usados por
  revisiones publicadas. No aceptar HTML ni iframes arbitrarios; URLs externas quedan fuera de la primera entrega.
- Primera entrega: clips escénicos sin audio. Los videos con voz/subtítulos requieren una ampliación posterior.

Criterios de aceptación: dueño publica una portada con video y puede volver a foto; funciona en
móvil y escritorio, con teclado y movimiento reducido; poster visible ante error; sin reproducción
sonora automática. Comprobar rendimiento con video representativo y el objetivo Lighthouse del plan.

## CRM personalizable

Navegación propuesta: **Resumen · Consultas · Huéspedes · Reservas · Tareas**. Finanzas conserva su
módulo y permisos. En móvil, agrupar navegación secundaria en “Más” en lugar de añadir más botones.

### Primera entrega útil

- **Consultas**: lista y tablero con etapas iniciales Nueva, Contactada, Cotizada, Ganada y Perdida.
  Origen (WhatsApp, web, Instagram, referido), responsable, fechas solicitadas y próxima acción.
- **Ficha de huésped**: datos de contacto, idioma, etiquetas, preferencias de atención, notas y enlaces
  a reservas. Mostrar historial y gasto solo a los roles autorizados y desde las fuentes existentes.
- **Tareas**: responsable, vencimiento y estado; vistas de hoy y pendientes. Recordatorios dentro del
  dashboard inicialmente, sin prometer envíos automáticos por WhatsApp.
- **Vistas guardadas**: filtros, columnas y orden; separar preferencias personales de configuración
  compartida de la organización.
- **Acciones rápidas**: abrir WhatsApp, copiar mensaje, crear tarea y abrir cotización cuando SD-402 exista.

### Qué puede personalizar el dueño

- Etiquetas, etapas comerciales, columnas visibles y vistas compartidas.
- Un catálogo pequeño de campos opcionales: texto corto, número, fecha, sí/no y selección.
  Definir límites de cantidad y tamaño antes de implementar; evitar JSON libre sin esquema.
- Plantillas de mensajes con variables permitidas y vista previa; envío manual inicialmente.
- Logo y acento del área privada mediante tokens específicos del dashboard, conservando contraste,
  colores de estado y estructura de navegación. Tema claro/oscuro y densidad son preferencias personales.

### Reglas de integridad y privacidad

- Las etapas comerciales no reemplazan los estados de reserva o pago. Mover una consulta a “Ganada”
  no confirma una reserva, no bloquea fechas y no registra un ingreso.
- Definir expresamente la relación consulta → huésped → cotización → reserva; evitar un segundo
  registro de huéspedes cuando se implemente SD-601.
- Sugerir posibles duplicados por teléfono/email normalizados; no fusionar automáticamente familias
  que comparten contacto. La fusión explícita debe conservar referencias e historial.
- Archivar etapas/campos con datos sin destruir el historial; cambios de tipo requieren conversión validada.
- Owner administra configuración; staff accede solo al alcance operativo definido y probado. No ampliar
  sus permisos financieros por introducir la ficha de huésped.
- RLS por organización para consultas, tareas, notas, campos y vistas compartidas; validar también FKs.
- No almacenar documentos de identidad, datos de tarjetas ni información sensible en notas libres.
  Definir conservación, eliminación y consentimiento antes de capturar nuevos datos personales.
- Auditar publicaciones, cambios de configuración, exportaciones y operaciones sensibles sin copiar
  contenido privado completo a los logs.

## Entregas propuestas

| Propuesta | Alcance y dependencia | Criterio de salida | Review |
|---|---|---|---|
| PP-01 · Diseño de referencia | Ampliación SD-209/210; inventario de contenido y prototipo móvil/escritorio con fotos de Saywa | Portada, unidad, contacto y editor revisables; estados vacíos y contenido largo contemplados | R |
| PP-02 · Editor de marca | SD-209 parte 1 + SD-210; presets, textos, fotos y vista previa privada | Saywa y demo se personalizan con datos; permisos y contraste verificados | R+S |
| PP-03 · Borrador y publicación | PP-02; revisiones, concurrencia y referencias a imágenes | Guardar no publica; publicación atómica, restauración y aislamiento probados | R+S |
| PP-04 · Secciones y variantes | PP-03 + SD-208; orden, visibilidad y composición inicial | Móvil sin desbordes; sin enlaces a secciones ocultas; precio consistente con el modelo nuevo | R+S |
| PP-05 · CRM base | Coordinar SD-601 y SD-401/406; consultas, ficha única, tareas y permisos | Una consulta puede seguirse hasta su reserva sin duplicar huésped ni confirmar pagos por mover tarjetas | R+S |
| PP-06 · Configuración del CRM | PP-05; campos, etapas, vistas y marca privada | Una segunda org configura su operación; archivar conserva datos; permisos financieros intactos | R+S |
| PP-07 · Validación con usuarios | PP-04/06; escenarios reales y rendimiento | Dueño edita/publica y staff completa seguimiento en móvil; incidencias críticas resueltas | R+S |
| PP-08 · Guía privada de la casa | SD-202 y publicación coordinada con PP-03; reglas, instrucciones, fotos y enlaces con contraseña | Consulta móvil autorizada; vencimiento, revocación y privacidad de imágenes probados | R+S |
| PP-09 · Video en portada | SD-202, SD-209/210, PP-03/04; selector foto/video y poster | Publicación, controles, fallback y rendimiento móvil verificados | R+S |

PP-03, PP-05 y PP-06 se descomponen en tickets de esquema/dominio/interfaz cuando se cierre el ADR;
no tratarlos como tickets pequeños. Mantener entregas verticales y revisables.

## Orden recomendado y límites

1. Claude termina SD-806. En paralelo solo preparar PP-01 como documento/prototipo aislado.
2. Completar SD-208 y el editor de SD-210 integrando PP-02/03/04, sin duplicar tickets.
3. Retomar calendario y primera reserva directa. No bloquear ese hito por más paletas o variantes.
4. Incorporar PP-05 con SD-601; PP-06 después de validar el CRM con Saywa.
5. Añadir las otras dos composiciones cuando la primera ya funcione bien y exista contenido adecuado.
6. Planificar PP-08 y PP-09 como entregas independientes al contar con sus dependencias; la guía
   admite envío manual sin esperar al CRM completo. Su prioridad relativa queda por acordar.

Fuera de esta primera versión: constructor libre tipo Webflow, plugins del usuario, CSS personalizado,
automatizaciones complejas, campañas masivas, bandeja WhatsApp integrada, CRM genérico de ventas y
cobro de suscripciones. Cada uno necesita alcance y evaluación propios.

## Validación y definición de terminado

- Pruebas unitarias de schemas, configuración, transiciones y límites de campos.
- pgTAP para aislamiento entre dos organizaciones, roles, referencias y publicación atómica.
- Prueba de dos ediciones concurrentes y de recursos referenciados al restaurar.
- Flujo comprobado: editar borrador → preview → publicar → visitante ve cambio → restaurar.
- Flujo comprobado: consulta → tarea → huésped/reserva vinculados, respetando permisos.
- Ajustar explícitamente la skill de testing si estos flujos se incorporan a Playwright: hoy limita los
  e2e a tres flujos concretos. No añadir suites duplicadas ni ignorar esa regla sin actualizar el acuerdo.
- Revisar móvil a 360 px y escritorio a 1440 px, teclado, foco, textos largos y fotos faltantes.
- Objetivo de Lighthouse móvil ≥90 en rendimiento y accesibilidad, medido en preview con imágenes
  representativas y condiciones documentadas; no sustituye la revisión manual de accesibilidad.
- Verificar dominio/idioma, metadatos, rutas publicadas y ausencia de borradores en respuestas públicas.
- `lint`, `typecheck`, `test`, `build` y pruebas de BD cuando corresponda; review antes del PR.
- Registrar por separado implementación, despliegue, migraciones pendientes y comprobación en producción.

## Cómo medir que mejora el producto

- El dueño cambia portada y textos y publica sin tocar código ni pedir soporte técnico.
- Una persona encuentra unidad, tarifa y contacto desde móvil sin explicación.
- Cada consulta abierta tiene un responsable y una siguiente acción visible.
- Se puede distinguir consulta pendiente, reserva confirmada y pago recibido sin ambigüedad.
- Se registran tiempo de respuesta y consultas convertidas cuando existan los eventos necesarios;
  definir línea base con Saywa antes de fijar objetivos numéricos.
- Un segundo alojamiento usa los mismos componentes con otra marca, sin cambios específicos en código.

## Coordinación entre agentes

Este plan se guarda como documento independiente para no editar el roadmap que Claude pueda tener abierto.
Antes de implementarlo, acordar responsable por ticket y usar checkouts separados. Integrar mediante PR;
no compartir cambios de rama, instalaciones, servidor de desarrollo ni reinicios de Supabase local.
Crear este documento no autoriza ni ejecuta cambios de BD remota.
