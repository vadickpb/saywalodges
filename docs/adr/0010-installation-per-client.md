# ADR 0010 · Instalación por cliente en lugar de SaaS

- Estado: aceptado · Fecha: 2026-11-01 · Reemplaza la premisa comercial "SaaS por suscripción" de ADR 0001 y ADR 0004
  (sus decisiones técnicas siguen vigentes).

## Contexto

Saywa Direct se diseñó como SaaS multi-tenant: una sola plataforma para muchos alojamientos, alta de clientes por un
superadmin (SD-603), dominios propios por API (SD-604) y una landing que vende planes (SD-704). El dueño decidió otro
modelo de negocio:

- **vender el sistema** a cada alojamiento;
- con **3 meses de garantía**;
- y después **mantenimiento mensual** (hosting, respaldos, actualizaciones, soporte);
- más adelante, **automatización de WhatsApp** con la API oficial (WhatsApp Business Cloud API).

## Decisión

- **Una instalación por cliente:** cada alojamiento tiene su proyecto Vercel y su proyecto Supabase, alojados en las
  cuentas del dueño de Saywa Direct. No se comparte base de datos entre clientes.
- **Mismo código para todos:** un solo repositorio. Cada instalación cambia solo configuración (variables de entorno) y
  contenido (lo que el dueño del alojamiento carga desde el panel). No hay ramas ni versiones por cliente.
- **Se conserva el modelo multi-tenant interno** (`org_id` + RLS + `private.is_member` en todas las tablas). Con una
  sola organización por instalación sigue funcionando sin cambios, es una segunda barrera de seguridad, y mantiene
  válidos los tests de aislamiento (`supabase/seed.sql` con dos organizaciones solo se usa en local).
- **Modo instalación** (`DEPLOYMENT_MODE=installation`, SD-1001): el dominio raíz del cliente sirve su sitio y `app.`
  sirve el panel. Sin esa variable el enrutado se comporta como hoy.
- **Fábrica de instalaciones:** script y runbook de alta (SD-1002), registro de instalaciones y despliegue de
  migraciones a todas con aprobación del dueño (SD-1003), y salud central de las N instalaciones (SD-1004).
- **La venta vive fuera del producto:** la web comercial (trabajo del PR #45) pasa a un sitio aparte del vendedor
  (SD-1006), y la prueba se hace en una **instalación demo compartida** que se reinicia cada noche (SD-1007).
- **Hosts en modo instalación:** el dominio raíz sirve solo el sitio público; el panel, la autenticación y todas las
  rutas `/api/*` (cron, iCal, salud, webhooks) viven en `app.<dominio>`; un host desconocido da 404.
- **Excepción a ADR 0002:** la service-role, que ADR 0002 limita a webhooks, cron y RPCs, también la usa el script de alta
  de clientes (SD-1002). Es un script que el dueño ejecuta en su máquina, fuera de la app desplegada; la app sigue sin
  usarla en páginas ni en acciones de usuario.
- **WhatsApp:** cliente de la Cloud API y webhook (SD-1008), luego plantillas y consentimiento del huésped (SD-1009), con
  credenciales por instalación. Va después del flujo de reservas (SD-403 a SD-406), porque se engancha a sus eventos.
- **Saywa Lodges es la instalación nº 1.**

## Consecuencias

- Numeración: el ADR 0009 (escritura de cotizaciones) llega con SD-402 (PR #46); este es el 0010.
- `CLAUDE.md` todavía describe el proyecto como «SaaS multi-tenant»: su actualización queda pendiente del dueño.
- **Descartados:** SD-603 (superadmin y aprovisionamiento en la app), porque lo reemplaza el script de alta. SD-604
  (dominios vía API de Vercel), porque el dominio de cada cliente es un paso del runbook.
- **Simplificados:** SD-502 pasa a credenciales de Mercado Pago **por instalación**, no por organización dentro de una
  plataforma compartida.
- **Reescritos:**
  - SD-606: la alerta remota pasa a ser parte de la salud central (SD-1004).
  - SD-702: plan de pago, respaldos y runbook se aplican **por instalación**.
  - SD-703: la demo pública es la instalación demo.
  - SD-704: su contenido se mueve a SD-1006.
- **Costos:** cada cliente suma un proyecto Supabase de pago y su parte de Vercel Pro, dominio y correo. El precio del
  mantenimiento debe cubrirlos. A cambio, el aislamiento es total ("tu sistema, tu base de datos"), lo que también es
  un argumento de venta.
- **Actualizaciones:** una mejora llega a todos los clientes desplegando el mismo código en cada proyecto. Las
  migraciones siguen siendo aditivas (`docs/workflow.md`), porque cada instalación se actualiza por separado.
- **Datos personales:** cada alojamiento es responsable de los datos de sus huéspedes; el contrato de mantenimiento debe
  definir respaldos, retención y bajas.
