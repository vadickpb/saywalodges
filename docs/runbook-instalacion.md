# Runbook: instalar un cliente nuevo (SD-1002)

Modelo: una instalación = un proyecto Supabase + un proyecto Vercel, en las cuentas del dueño, con el mismo código
([ADR 0010](adr/0010-installation-per-client.md)). `scripts/install-client.mjs` automatiza lo que tiene API; lo demás son
pasos manuales que este documento lista **en orden**. Tiempo estimado: 30–45 min (más la propagación del DNS).

> El script **no crea proyectos de pago**: el proyecto Supabase lo creas tú (paso 2). Por defecto hace un *dry-run*
> (no cambia nada); solo con `--apply` ejecuta.

## 0. Antes de empezar (una vez)
- Cuenta de **Vercel Pro** (el plan Hobby no admite uso comercial) y **Supabase** con el plan que cubra un proyecto por cliente.
- Tokens, solo en tu terminal (no en archivos):
  - `export SUPABASE_ACCESS_TOKEN=...` → <https://supabase.com/dashboard/account/tokens>
  - `export VERCEL_TOKEN=...` → <https://vercel.com/account/tokens>
- El repo clonado y `npm ci` hecho, **fuera de carpetas sincronizadas** (iCloud, Dropbox, Drive): `.install/` guarda las claves service-role de los clientes. La app de GitHub de Vercel debe tener acceso a `vadickpb/saywalodges`.

## 1. Datos del cliente
Copia `deploy/install.example.json` a `deploy/installs/<cliente>.json` (**sin secretos**; `deploy/installs/` está en `.gitignore` porque el repo es público y no debe contener datos de clientes) y complétalo: `slug`, `name`, `rootDomain` (dominio raíz, sin `app.`), `ownerEmail`,
`whatsappNumber` (solo dígitos con código de país), `supabase.projectRef` (paso 2), `vercel.projectName`, y `email.from`
si ya verificaste el dominio en Resend.

## 2. Crear el proyecto Supabase (manual)
1. <https://supabase.com/dashboard> → **New project**, organización tuya, región cercana a Perú (`us-east-1` o `sa-east-1`).
2. Genera una contraseña fuerte y guárdala en tu gestor. Luego: `export SUPABASE_DB_PASSWORD='...'`.
3. El `projectRef` son las 20 letras de la URL del proyecto (`https://<ref>.supabase.co`). Ponlo en el JSON.

## 3. Ensayo (no cambia nada)
```bash
npm run install-client -- deploy/installs/<cliente>.json
```
Revisa que muestre el dominio, el panel `app.<dominio>` y las variables correctas.

## 4. Ejecutar
```bash
npm run install-client -- deploy/installs/<cliente>.json --apply
```
Hace, en orden, y se puede repetir si algo falla (guarda el progreso en `.install/<slug>.state.json`, que contiene los
secretos generados y **no se commitea**):
1. `keys`: obtiene las claves anon y service-role y genera `CRON_SECRET`.
2. `migrations`: `supabase link` + `supabase db push` (aplica todas las migraciones al proyecto del cliente y vuelve a desenlazar el clon con `supabase unlink`).
3. `auth`: Site URL, redirect `https://app.<dominio>/auth/callback` y **desactiva el registro de usuarios nuevos** (si no se puede por API, el script te lo pide y no sigue al `seed`).
4. `seed`: crea el owner (ya confirmado, sin contraseña), la organización, la propiedad **sin publicar** y la membresía `owner`.
5. `vercel`: crea el proyecto desde el repo, carga las variables (las sensibles solo en producción) y añade `<dominio>` y
   `app.<dominio>`. Los *previews* quedan desactivados en el proyecto del cliente.
Si el script no pudo configurar Auth por API, haz lo que te indica a mano, pon `"signupDisabled": true` en `.install/<slug>.state.json` y continúa con `--step=seed`. Para repetir un solo paso: `--step=keys|migrations|auth|seed|vercel`.

## 5. DNS (manual, en el proveedor del dominio)
Vercel → proyecto → **Settings → Domains** muestra el registro exacto de cada dominio. Normalmente:
- `<dominio>` → `A 76.76.21.21`
- `app.<dominio>` → `CNAME cname.vercel-dns.com`
- `www.<dominio>` → opcional: añádelo en Vercel como **Redirect to** `<dominio>`.
Verifica con `dig +short <dominio>` y espera a que Vercel marque «Valid Configuration».

## 6. Primer despliegue
Vercel → proyecto → **Deployments**. Si hay un deployment de `main`, pulsa **Redeploy** (las variables se cargaron después de crearlo). Si no hay ninguno, haz un push vacío a `main` (`git commit --allow-empty -m "chore: first deploy" && git push`) o ejecuta `npx vercel deploy --prod` desde el repo enlazado al proyecto. Debe terminar en verde.

## 7. Cron (manual)
Dos llamadas, cada 15 minutos, con `Authorization: Bearer <CRON_SECRET>` (el valor está en `.install/<slug>.state.json`):
- `POST https://app.<dominio>/api/cron/expire-holds`
- `POST https://app.<dominio>/api/cron/ical-sync`
Con <https://cron-job.org>: **Create cronjob** → URL, *Advanced → Request method* POST, cabecera `Authorization`, cada 15 min.
Más adelante SD-1003 lo automatiza con el registro de instalaciones. Detalles en [`cron.md`](cron.md).

## 8. Resend (manual)
Resend → **Domains** → añade el dominio de envío (p. ej. `mail.<dominio>`) y crea los registros DNS que indica. Cuando esté
«Verified», crea una API key y guárdala en Vercel como `RESEND_API_KEY` (sensible) y `EMAIL_FROM` si falta. Redeploy.

## 9. Entregar al cliente
1. El owner abre `https://app.<dominio>/forgot-password`, escribe su correo y fija su contraseña con el enlace que recibe. **Pruébalo tú antes de entregar**: si el enlace del correo no termina en `/update-password`, revisa las Redirect URLs de Supabase Auth.
2. Carga contenido y fotos, y **publica** la propiedad desde el panel (queda sin publicar a propósito).
3. Prueba un flujo completo: cotización → enlace → reserva → correo recibido.
4. Anota la fecha de entrega: empieza la garantía de 3 meses.

## 10. Registrar la instalación para las actualizaciones (manual, una vez por cliente)
Así las migraciones futuras llegan a este cliente con **tu aprobación** (SD-1003). Sin este paso, el cliente no recibe
actualizaciones de base de datos.
Usa un **id opaco** (`inst-0002`, `inst-0003`…), **no** el slug del cliente: el registro, el nombre del Environment y los
nombres de job de Actions son públicos y no deben revelar quiénes son tus clientes. Donde abajo dice `<id>`, es ese id.
1. GitHub → Settings → Environments → **New environment** `supabase-<id>`.
2. **Required reviewers**: tú (deja *Prevent self-review* desactivado). **Deployment branches** → solo `main`. Primero las
   reglas y después los secretos.
3. Secretos **del Environment** (no del repo): `SUPABASE_ACCESS_TOKEN` y `SUPABASE_DB_PASSWORD` (el de este proyecto).
   Variables: `SUPABASE_PROJECT_ID` = el `projectRef` del cliente e `INSTALLATION_ID` = `<id>` (el workflow se niega a desplegar si no coincide con el registro). Por terminal:
   ```bash
   gh secret set SUPABASE_ACCESS_TOKEN --env supabase-<id> --repo vadickpb/saywalodges
   gh secret set SUPABASE_DB_PASSWORD  --env supabase-<id> --repo vadickpb/saywalodges
   gh variable set SUPABASE_PROJECT_ID --env supabase-<id> --repo vadickpb/saywalodges --body <projectRef>
   gh variable set INSTALLATION_ID     --env supabase-<id> --repo vadickpb/saywalodges --body <id>
   ```
4. Añade `{ "id": "<id>", "environment": "supabase-<id>" }` a `deploy/installations.json` por PR. **No pongas nombre
   del cliente, dominio ni ref**: el repo es público.
5. Comprueba: Actions → *Deploy database* → **Run workflow** con `installation` = `<id>`. Debe quedar en «Waiting»;
   aprueba. **Ojo: no es un simulacro**: el job aplica de verdad las migraciones que falten (en un proyecto recién instalado ya están, así que el «Dry run» debe decir *Remote database is up to date* y no cambia nada).

## Verificación rápida
- `https://<dominio>` muestra el sitio (tras publicar) y `https://app.<dominio>/login` el acceso.
- Cualquier otro host da 404; `https://<dominio>/login` también (las sesiones viven solo en `app.`).
- `curl -i -X POST -H "Authorization: Bearer <CRON_SECRET>" https://app.<dominio>/api/cron/expire-holds` → `200`.

## Si algo falla
- **El script dice `HTTP 401/403`**: el token caducó o es de otra cuenta; genera uno nuevo.
- **`db push` falla por contraseña**: `SUPABASE_DB_PASSWORD` no es la del proyecto del cliente (Project Settings → Database → Reset).
- **El panel redirige a la landing o da 404**: revisa que `DEPLOYMENT_MODE=installation`, `ROOT_DOMAIN` y
  `NEXT_PUBLIC_SITE_URL=https://app.<dominio>` coinciden; la app falla al arrancar en producción si no (`lib/env.ts`).
- **El reset de contraseña no llega**: Supabase usa su SMTP de prueba (muy limitado); configura SMTP propio en
  Authentication → SMTP Settings con Resend.
- **«Could not create the owner»**: ese correo ya existe en el proyecto. Si es tu cuenta, copia su id (Supabase → Authentication → Users) como `ownerUserId` en el archivo de estado y repite `--step=seed`; el script nunca adopta usuarios ajenos.
- Un paso a medias es seguro de repetir; borrar `.install/<slug>.state.json` solo si quieres regenerar los secretos.
