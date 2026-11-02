# Instalación demo compartida (SD-1007)

Una instalación más, con datos **ficticios**, para que un posible comprador pruebe el sistema. Se reinicia sola cada noche
(03:30 hora de Lima) y la web de ventas (SD-1006) enlazará a ella con las credenciales a la vista.

## Qué trae
- Sitio público «Casa Demo Valle» (publicado), 2 unidades, temporada alta (desde el día del reseteo, 120 días), tarifas,
  cargos, espacios, servicios y distancias. Nada de Saywa Lodges ni de clientes reales (`scripts/lib/demo-data.mjs`, con test).
- Un único usuario, **`staff`** (no `owner`): `demo-staff@example.com` / `demo-saywa-2026`. Es público a propósito. Su contraseña se
  vuelve a fijar cada noche por si un visitante la cambia.
- Banner amarillo en el panel: «Demo: los datos se reinician cada noche…» (variable `DEMO_MODE=true`).
- **Sin correos**: la demo no tiene `RESEND_API_KEY` (el script de instalación no la carga si `"demo": true`) y en producción, sin
  clave, el envío queda deshabilitado. Ningún visitante puede mandar un correo real desde la demo.

## Cómo se reinicia
`scripts/demo-reset.mjs` (lo ejecuta `.github/workflows/demo-reset.yml`):
1. **Salvaguarda**: se niega a seguir si el proyecto tiene **cualquier organización distinta de la demo**, si la organización demo **no existe** (así un proyecto vacío de un cliente nuevo no se confunde con la demo; la primera vez se usa `--init` a mano) o si el **registro de usuarios está abierto**. Un cliente real siempre
   tiene la suya, así que apuntarlo a un proyecto de cliente por error aborta antes de borrar nada.
2. Fija de nuevo la contraseña del staff (o lo crea).
3. Borra la organización demo (los datos cuelgan de ella con `ON DELETE CASCADE`: reservas, huéspedes, cotizaciones, tarifas…) y la
   vuelve a crear desde cero.
También vacía los archivos que el staff haya subido (fotos y comprobantes, buckets `property-photos` y `finance-receipts`, bajo `<id de la organización>/`), porque el borrado en cascada no los elimina. Los datos de configuración se validan **antes** de borrar nada: un `DEMO_ROOT_DOMAIN` mal escrito aborta con la demo intacta.
Si falla a mitad, la demo queda incompleta hasta la siguiente ejecución (o hasta lanzar el workflow a mano).

## Probarlo en tu máquina (base local, sin riesgo)
Con el stack local arrancado (`npx supabase@2.122.0 start`):
```bash
export DEMO_SUPABASE_URL=http://127.0.0.1:54321
export DEMO_SERVICE_ROLE_KEY=$(npx supabase@2.122.0 status -o env | grep '^SERVICE_ROLE_KEY=' | cut -d'"' -f2)
node scripts/demo-reset.mjs            # el guard debe NEGARSE: la base local tiene las orgs Saywa y Demo del seed
```
Para ver el reseteo completo hay que dejar la base local solo con la organización demo (**solo en local**):
`docker exec supabase_db_saywa-lodges psql -U postgres -c "delete from public.organizations"` y luego
`node scripts/demo-reset.mjs --apply`. Al terminar, `npx supabase@2.122.0 db reset` devuelve tu base de desarrollo a su estado normal.

## Crear la instalación demo real (una vez, manual)
Necesitas un proyecto Supabase nuevo **solo para la demo** y un proyecto Vercel (misma cuenta Pro).
1. Crea el proyecto Supabase (runbook-instalacion.md, paso 2) y copia su `projectRef`.
2. Copia `deploy/install.example.json` a `deploy/installs/demo.json` y ponle: `"slug": "demo-lodge"`, `"name": "Casa Demo Valle"`,
   `"rootDomain"` = el dominio de la demo (p. ej. `demo.tudominio.com`; **sin** `app.`), `"ownerEmail"` = tu correo, `"demo": true`,
   y el `projectRef`. Con `"demo": true` se carga `DEMO_MODE=true` y **no** se carga clave de correo.
3. Ejecuta los pasos del script **menos `seed`** (la organización la crea el reseteo; si la creara el script, el guard se
   negaría a resetear):
   ```bash
   for s in keys migrations auth vercel; do npm run install-client -- deploy/installs/demo.json --apply --step=$s; done
   ```
4. DNS y primer despliegue: runbook-instalacion.md, pasos 5 y 6.
5. Configura el reseteo (Environment sin reviewers, solo `main`):
   ```bash
   gh api -X PUT repos/vadickpb/saywalodges/environments/demo-reset --input - <<'JSON'
   {"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
   JSON
   gh api -X POST repos/vadickpb/saywalodges/environments/demo-reset/deployment-branch-policies -f name=main -f type=branch
   gh secret set DEMO_SUPABASE_URL      --env demo-reset --repo vadickpb/saywalodges   # https://<projectRef>.supabase.co
   gh secret set DEMO_SERVICE_ROLE_KEY  --env demo-reset --repo vadickpb/saywalodges   # jq -r .serviceRoleKey .install/demo-lodge.state.json
   gh secret set DEMO_ROOT_DOMAIN       --env demo-reset --repo vadickpb/saywalodges   # el mismo rootDomain del paso 2
   ```
6. **Primer reseteo, a mano y una sola vez** (el workflow nunca usa `--init`):
   ```bash
   export DEMO_SUPABASE_URL=https://<projectRef>.supabase.co
   export DEMO_SERVICE_ROLE_KEY=$(jq -r .serviceRoleKey .install/demo-lodge.state.json)
   export DEMO_ROOT_DOMAIN=<el mismo rootDomain>
   node scripts/demo-reset.mjs --apply --init
   ```
   Debe terminar con «Demo reset done.». Si dice que el registro está abierto, desactiva «Allow new users to sign up» en Supabase y repite.
   Después: Actions → *Demo reset* → **Run workflow**; también debe terminar en verde.
   Comprueba la protección del Environment: `gh api repos/vadickpb/saywalodges/environments/demo-reset --jq .deployment_branch_policy` debe mostrar `custom_branch_policies: true`.
7. Registra la demo para recibir migraciones (runbook, paso 10) con un id opaco y, si quieres, el monitoreo (paso 11).
8. Comprueba: abre `https://<rootDomain>/es` (sitio) y `https://app.<rootDomain>/login` con el staff público; debe verse el banner.

## Lo que un visitante con el staff público puede hacer (riesgo aceptado, dura como mucho un día)
Cambiar la contraseña del staff (echa a los demás hasta el reseteo), despublicar el sitio, editar textos, WhatsApp y correo del sitio, y crear cotizaciones y reservas de prueba. **No** puede cambiar el anticipo, usar calendarios iCal, ver reportes ni exportar finanzas, invitar usuarios ni llegar a otra organización. Sin `RESEND_API_KEY` la app no envía correos; el correo de recuperación de contraseña sale por el SMTP por defecto de Supabase, que solo entrega a miembros del equipo del proyecto: **no configures SMTP propio en el proyecto demo**.
El riesgo residual del workflow es que quien pueda hacer push a `main` obtiene la clave de la demo: protege `main` (solo PR) y no des escritura a terceros.

## Aviso importante
`DEMO_SERVICE_ROLE_KEY` da control total del proyecto demo. Por eso la demo **no comparte proyecto Supabase con ningún cliente** y el
guard lo comprueba en cada ejecución. Nunca pongas aquí la clave de otro proyecto.
