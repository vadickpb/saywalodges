# Lanzamiento de Saywa Lodges: auditoría y pasos del dueño (SD-1121)

Auditoría de solo lectura del **2026-11-19** contra [`produccion.md`](produccion.md) (Vercel, Supabase y GitHub por MCP/`gh`; no se leyeron valores de variables ni se tocó ninguna BD o panel). Cada fila dice qué se verificó y qué queda. Esto es una foto: repetir antes de aceptar la primera reserva.

## Resultado de la auditoría

| Casilla de `produccion.md` | Estado | Evidencia / qué falta | Quién |
|---|---|---|---|
| Despliegue Production Ready | **Hecho** | Último despliegue de producción = `main` (#137), estado READY | — |
| Migraciones remotas = repo | **Hecho** | 51 migraciones remotas, idénticas a las 51 del repo (misma lista de versiones); la última (`20261118210000`) coincide con el repo; *Deploy database* verde | — |
| Dominio `<dominio>` y `www` | **Parcial** | `saywalodges.com` y `www.saywalodges.com` verificados en Vercel; el sitio responde 200 en `www` (`/es`, `/es/cotizar`). El apex **redirige a `www`** (la guía asume lo contrario: no es un fallo, es una decisión a registrar) | Dueño (decidir) |
| `app.<dominio>` (panel) | **Falta** | `app.saywalodges.com` **no está** en el proyecto Vercel ni resuelve DNS. Hoy el panel/health/cron responden en `saywalodges.vercel.app` (`/login` 200, `/api/health` 401 sin token) | Dueño |
| Variables de Vercel | **No verificable** | El MCP no tiene permiso para listar variables (403) y la CLI local no está enlazada. Comprobarlo con `vercel env ls production` (solo nombres) | Dueño |
| Cron `ical-sync`, `expire-holds` | **Hecho** | `Scheduled crons` corre cada 15 min con HTTP 200 (secretos `CRON_URL`/`CRON_SECRET` existen) | — |
| Cron `booking-emails`, `voucher-purge` | **Hecho en código (SD-1120, #138)** | No estaban programados: sin ellos no salía ningún correo de reserva. Ahora corren desde el mismo workflow (correos cada 15 min; purga diaria). Falta ver una ejecución verde | Dueño (verificar) |
| Monitor *Installation health* | **Hecho** | Ejecuciones horarias en verde; Environment `health-saywa-lodges` existe | Dueño (confirmar «healthy», no «NOT MONITORED») |
| Seguridad Supabase (`get_advisors`) | **Aceptable** | Sin ERROR. Avisos WARN: funciones `SECURITY DEFINER` ejecutables por `anon`/`authenticated` (son las RPC públicas y de dueño por diseño; cada una valida host/token/membresía) y **protección contra contraseñas filtradas desactivada** (requiere plan Pro) | Dueño (Pro) |
| Plan Supabase y backups | **Falta** | La organización está en plan **free**: sin backups descargables ni PITR y con riesgo de pausa por inactividad. [ADR 0010](adr/0010-installation-per-client.md) exige plan de pago antes de reservas reales | **Solo el dueño** |
| Copia de Storage y restauración de ensayo | **Falta** | No verificable por herramientas | **Solo el dueño** |
| Resend (dominio verificado, API key, `EMAIL_FROM`) | **No verificable** | Sin acceso a Resend ni a variables. Prueba real de correo pendiente | **Solo el dueño** |
| SD-701 CSP en Preview | **Falta** | Implementada; la verificación manual con `CSP_REPORT_ONLY=1` en un Preview exige navegador y proyecto de ensayo | **Solo el dueño** (el agente corrige si hay hallazgos) |
| Texto legal (D1) | **Falta** | `dictionaries/checkout-policies.ts` muestra un texto neutro («escribe por WhatsApp»); es seguro pero provisional | **Solo el dueño** |
| Cuenta de pago (Yape/transferencia) | **Falta** | Se carga en el panel (no hay dato en el repo) | **Solo el dueño** |

## Qué se hizo en código

- **SD-1120 (#138, mergeado)**: programa `booking-emails` y `voucher-purge` en `.github/workflows/scheduled-crons.yml`.
- Pendientes de bajo riesgo que **no** bloquean la primera reserva: SD-414 (FK de bloques), SD-415 (test de concurrencia), SD-416 (mensaje de comprobante purgado), SD-417 (borrado de aprobados, espera D3), SD-418 (aviso de revisión demorada). SD-307 ya está implementado (workflow); su casilla del roadmap queda por cerrar con una ejecución real de un feed.
- No se redactó texto legal: no se inventa (D1).

## Pasos del dueño, en orden mínimo

### A. Antes de cualquier reserva real

1. **Pasar Supabase a Pro** — supabase.com/dashboard → organización → Billing → Upgrade a **Pro**. Comprobar: Project → Database → Backups muestra un backup diario. Si no se hace: sin backups y con posible pausa del proyecto. Después: Authentication → Providers/Password → activar **Leaked password protection**.
2. **Elegir host del panel.** Opción recomendada: añadir `app.saywalodges.com` — Vercel → proyecto `saywalodges` → Settings → Domains → Add; copiar al DNS los registros exactos que muestre; esperar **Valid Configuration**. Luego Supabase → Authentication → URL Configuration: Site URL y redirect `https://app.saywalodges.com/auth/callback`. Si prefieres seguir en `saywalodges.vercel.app`, di «D12: sigo en vercel.app» y se documenta; el dominio propio es mejor para correos y confianza.
3. **Revisar variables** — terminal: `vercel --scope vadickpbs-projects env ls production` dentro de un clon enlazado (`vercel link`). Deben existir los nombres de la tabla de [`produccion.md`](produccion.md#variables-de-vercel-inventario-completo), en especial `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`, `HEALTH_SECRET`, `EMAIL_ARRIVAL_INSTRUCTIONS_ES/EN`. Si cambias algo: **Redeploy** y comprobar Ready.
4. **Resend** — resend.com → Domains: el dominio de `EMAIL_FROM` en **Verified**. Verificación: la reserva de prueba (paso C) debe llegar a tu correo y al del huésped de prueba.
5. **Secretos de cron** — GitHub → repo → Settings → Secrets → `CRON_URL` debe ser el host del paso 2 (sin barra final) y `CRON_SECRET` igual al de Vercel. Actions → **Scheduled crons** → Run workflow: las 4 rutas en verde (`HTTP 200`).
6. **Health** — Actions → **Installation health** → Run workflow (`installation` = `saywa-lodges`): debe decir `Installation saywa-lodges: healthy.` Si `HEALTH_URL` apunta al host viejo, actualizar el secreto del Environment `health-saywa-lodges` tras el paso 2.
7. **Texto legal (D1)** — escribe (o con abogado) cancelación y términos y envíalos; el agente los carga en `dictionaries/checkout-policies.ts`. Mientras no exista, el sitio dice «consulta por WhatsApp»; es aceptable para la prueba, no para publicidad.

### B. Pagos y publicar

8. **Cuenta de pago** — panel → **Ajustes** → cuentas de pago → añadir Yape (titular + celular) y/o transferencia (banco, cuenta, CCI de 20 dígitos), moneda y *Activo*. Verificación: abrir una cotización pública y ver «Dónde pagar» con tus datos.
9. **Publicar propiedad** — panel → **Sitio** → Unidades reservables: cada casa **Activa**, con fotos, precios y descripción (el otro chat carga las villas). Comprobar `https://www.saywalodges.com/es` en móvil, en `/es` y `/en`.

### C. Reserva de prueba controlada

10. Panel → **Cotizar** → generar enlace para 1 noche futura barata → abrir en ventana privada con un correo tuyo → reservar → subir un comprobante cualquiera → en panel **Reservas** aprobar el pago. Verificar: llegan los correos (≤15 min por el cron), la reserva queda confirmada y el calendario bloquea las fechas. Luego **Cancelar reserva** con motivo «prueba» (no borrar). Si algo falla: Vercel → Logs filtrando `cron.booking_emails`.
11. Anotar la prueba en tu registro privado y volver a ejecutar *Installation health*. Con eso se cumple el criterio del lote 2 y puedes pasar a HostStay.

### D. Después (no bloquea)

- SD-701: verificación CSP en Preview ([`produccion.md`](produccion.md#2-validación-csp-en-preview-sd-701)), antes de promocionar el sitio.
- Prueba de restauración de backup y copia de Storage ([`produccion.md`](produccion.md#3-runbook-de-incidentes)), dentro del primer mes.
