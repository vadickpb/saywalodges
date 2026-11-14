# Plan comercial — vender Saywa Direct a anfitriones de Airbnb

Fecha: 2026-11-14. Complementa a [`roadmap.md`](roadmap.md) (qué es cada ticket) y [`cola.md`](cola.md) (orden y
quién). Modelo de negocio: instalación por cliente, [ADR 0010](adr/0010-installation-per-client.md).

## 1. Qué se vende

Un sistema para anfitriones que hoy dependen de Airbnb/Booking: web propia con SEO y reservas directas, calendario
único sincronizado con los canales, cotizador con enlace de pago, finanzas con reportes y mensajes automáticos por
WhatsApp. Se entrega instalado (dominio, datos importados, capacitación), con 3 meses de garantía y mantenimiento
mensual.

Tres nombres que no se deben mezclar:

| Nombre | Qué es | Dónde vive |
|---|---|---|
| **Saywa Lodges** | El alojamiento del dueño. Instalación nº 1 y caso de éxito | `saywalodges.com` |
| **Saywa Direct** (nombre por confirmar, D7) | El producto | Este repositorio |
| **Web de ventas + demo** | Donde se promociona y se prueba el producto | Dominio propio del producto (D8) |

## 2. Estado actual

| Área | Estado | Falta para vender |
|---|---|---|
| Web pública con SEO, editor de apariencia, guía privada, video | Hecho | Libro de Reclamaciones y páginas legales (SD-1105) |
| Tarifas, temporadas, cotizador, reserva con comprobante | Hecho | Mercado Pago (Fase 5, opcional para la primera venta) |
| Calendario estilo Airbnb, iCal de entrada y salida | Hecho en parte | Sincronización automática (SD-307), precio por rango (SD-421) |
| Finanzas: libro, reportes, Excel, importar Airbnb | Hecho | Ingresos automáticos de reservas (SD-807), importar gastos (SD-420) |
| Instalación por cliente: modo, script, despliegue de BD, salud | Código hecho | Nunca se probó con cuentas reales (SD-1002/1003/1004) |
| Demo con reinicio nocturno | Código hecho | Crear los proyectos reales y llenarla de datos (SD-1007, SD-1104) |
| WhatsApp Cloud API | Cliente y webhook hechos | Plantillas, opt-in, reglas automáticas (SD-1009 a SD-1012) |
| Web de ventas | No existe | SD-1006, SD-1110 a SD-1112 |
| Marca blanca y módulos | No existe | SD-1102, SD-1103 |
| Licencia, contrato, manual del cliente | No existe | SD-1106, SD-1107 |

## 3. Lo que faltaba en el plan

1. **Marca blanca.** Quedan valores de Saywa Lodges fijos en el código (`config/site.ts`, `lib/env.ts`,
   `lib/domain/site-theme.ts`). Un cliente nuevo no debe ver nada de Saywa (SD-1102).
2. **Módulos por instalación.** Para vender «tal cual» en paquetes (Base, Pro) hace falta encender y apagar
   finanzas, guía, WhatsApp, pago en línea y CRM sin tocar código (SD-1103).
3. **Regla para pedidos a medida.** Sin regla, cada cliente termina con su copia del código y el mantenimiento se
   vuelve imposible. Propuesta en la sección 5 (SD-1101).
4. **Licencia.** El repositorio es público y no tiene licencia. Sirve como portafolio, pero hay que declarar que el
   código se puede leer y no reutilizar comercialmente, o hacerlo privado (D9, SD-1107).
5. **Demo con vida.** La demo actual no trae reservas ni finanzas; un prospecto vería pantallas vacías (SD-1104).
6. **Requisitos legales del cliente en Perú.** Libro de Reclamaciones virtual, política de privacidad y términos
   editables. El texto lo valida un asesor legal; el sistema solo da la página y el formulario (SD-1105).
7. **Sincronización automática de calendarios.** Hoy el anfitrión pulsa «Sincronizar». Para vender a anfitriones de
   Airbnb es el requisito nº 1 (SD-307, ya existía pero estaba sin lote).
8. **Manual y soporte.** Manual del cliente, ayuda dentro del panel y un canal de soporte con plantillas de
   incidencia (SD-1106).
9. **Salida de datos.** Exportar todo lo del cliente en un archivo: argumento de venta y obligación razonable si
   deja el mantenimiento (SD-1108).
10. **Tablero público de tickets.** Los tickets viven solo en `roadmap.md`; el repositorio tiene 0 issues. Para
    que el trabajo sea demostrable ante reclutadores, cada ticket debe ser un issue con hito y PR enlazado (SD-904).

Fuera de alcance por ahora, se ofrecen como trabajo a medida: comprobantes electrónicos SUNAT, channel manager por
API, precios dinámicos, gestión de limpieza.

## 4. Etapas

Cada etapa es un lote de `cola.md`. El dueño aprueba el lote; los tickets avanzan solos y llegan como PRs
mergeados. Los tamaños son los del roadmap (`S` ≤ 1 día, `M` 2–3, `L` 4–5).

| Etapa | Lote | Objetivo | Tickets | Resultado demostrable |
|---|---|---|---|---|
| A | 5 (en curso) | Producto base completo en Saywa Lodges | SD-421, SD-420, SD-307, SD-807 | Calendario y finanzas se actualizan solos |
| B | 6 | Vendible tal cual | SD-1101, SD-1102, SD-1103, SD-903, SD-1107 | Una segunda instalación sin rastro de Saywa, con versión `v1.0.0` |
| C | 7 | Demo y web de ventas | SD-1007, SD-1104, SD-1006, SD-1110, SD-1111, SD-1112 | Enlace público: web de ventas → «Probar demo» |
| D | 8 | WhatsApp automático | SD-1009, SD-1010, SD-1011, SD-1012 | Reserva confirmada → mensaje al huésped sin intervención |
| E | 9 | Entrega al cliente | SD-1105, SD-1106, SD-1108, SD-605, SD-606 | Manual, páginas legales, exportación y auditoría |
| F | 4 | Cobro en línea | SD-501 a SD-505 | Pago con Mercado Pago |
| G | 10 | CRM y portafolio | SD-601, SD-602, SD-904, SD-703 | Ficha de huésped, check-in digital, tablero público |

Orden y motivo: B antes que C porque la demo es una instalación más y debe salir del script ya sin marca fija. C
antes que D porque la web de ventas no depende de Meta, y la verificación de Meta (D5) tarda semanas: hay que
iniciarla ahora para que D no quede bloqueada. F va después porque la primera venta puede cerrarse con pago por
comprobante.

Camino corto a la primera venta: etapas A, B y C. Son unos 15 tickets, de 5 a 6 semanas de trabajo de los agentes
si los pasos del dueño (cuentas, precio, dominio) no se demoran.

## 5. Vender tal cual y también a medida

Una sola base de código para todos los clientes. Lo que cambia entre clientes entra por uno de tres niveles:

| Nivel | Qué cubre | Cómo | Costo para el cliente |
|---|---|---|---|
| 1 · Configuración | Marca, colores, textos, secciones, tarifas, plantillas de mensajes | Panel del dueño | Incluido |
| 2 · Módulos | Finanzas, guía privada, WhatsApp, pago en línea, CRM | Interruptores por instalación (SD-1103) | Según paquete |
| 3 · A medida | Una función que el producto no tiene | Ticket pagado; se integra a la base detrás de un interruptor | Cotizado aparte |

Regla del nivel 3: nunca se crea una rama o copia por cliente. La función entra a `main` apagada por defecto y se
enciende solo en esa instalación. Así todos los clientes reciben las mismas versiones y la función queda disponible
para venderla a otros.

## 6. Web de ventas y demo

- **Dónde**: mismo repositorio, grupo de rutas propio servido solo con `DEPLOYMENT_MODE=vendor`, en un proyecto
  Vercel y dominio aparte. Reutiliza los tokens de diseño, el CI y el trabajo del PR #45. En las instalaciones de
  clientes esas rutas dan 404. Alternativa: repositorio aparte; duplica CI y flujo de trabajo (D8).
- **Contenido**: propuesta de valor para anfitriones de Airbnb, cómo funciona, módulos, caso Saywa Lodges con
  cifras aprobadas por el dueño, paquetes y precios (D4), preguntas frecuentes, botón «Probar demo», formulario de
  contacto y botón de WhatsApp.
- **SEO**: páginas por intención de búsqueda («sistema de reservas para Airbnb», «web propia para alquiler
  vacacional», «calendario sincronizado con Airbnb»), metadatos, Open Graph, sitemap, datos estructurados,
  Lighthouse móvil ≥ 90.
- **Demo**: instalación propia con datos ficticios (casas, 12 meses de reservas y finanzas, bloqueos de canales,
  guía), botón «Entrar a la demo» sin escribir contraseña, recorrido guiado y reinicio cada noche.

## 7. WhatsApp automático

Base hecha en SD-1008 (envío, simulación, webhook firmado). Falta:

| Ticket | Qué automatiza |
|---|---|
| SD-1009 | Plantillas de reserva (confirmación, recordatorio de adelanto, llegada, post-estadía) y consentimiento del huésped |
| SD-1010 | Reglas: «cuando pase X, enviar plantilla Y» con cola de envíos idempotente y horario permitido |
| SD-1011 | Avisos al dueño: reserva nueva, comprobante subido, conflicto de calendario |
| SD-1012 | Mensajes entrantes: bandeja simple y respuesta automática con el enlace del cotizador |

Límites que se explican al cliente: Meta exige verificar el negocio y aprobar cada plantilla, cobra por mensaje, y
solo deja escribir libremente dentro de las 24 horas posteriores al último mensaje del huésped. Los huéspedes de
Airbnb no entran por aquí: Airbnb no entrega su teléfono.

## 8. Forma de trabajo

- Un ticket = un issue de GitHub = una rama = un PR con squash merge y Conventional Commit. El PR cierra el issue.
- Codex implementa pantallas, CRUD y textos; Claude implementa base de datos, dinero y seguridad, y revisa.
- `risk:low` se mergea solo con CI verde; `risk:high` pasa por revisión. Las migraciones llegan a producción con
  la aprobación del dueño en *Deploy database*.
- `release-please` (SD-903) genera CHANGELOG y etiquetas: `main` actualiza la demo, cada versión actualiza a los
  clientes.
- El dueño interviene en tres momentos: aprobar un lote, aprobar *Deploy database* y los pasos «Te toca a ti».

## 9. Decisiones del dueño

Detalle en [`decisiones-pendientes.md`](decisiones-pendientes.md). Bloquean este plan: D4 (precios), D5 (iniciar
verificación de Meta), D7 (nombre del producto), D8 (dónde vive la web de ventas y su dominio), D9 (licencia y
visibilidad del repositorio), D10 (paquetes y qué módulos incluye cada uno).
