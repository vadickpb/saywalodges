# Salud de las instalaciones (SD-1004)

Para cobrar mantenimiento hay que **demostrar** que se vigila. Cada instalación expone `GET /api/health` en
`https://app.<dominio>/api/health`; un workflow del vendedor lo consulta cada hora y, si algo falla, **GitHub te envía un
correo** de ejecución fallida. No hay servicios de pago ni agentes extra.

## Qué responde
Requiere `Authorization: Bearer <HEALTH_SECRET>`. Sin él (o con uno incorrecto, o si la instalación no lo tiene
configurado) responde `401` vacío y no revela nada.

| HTTP | Significado |
|---|---|
| `200` | Todo bien |
| `503` | Degradada: el cuerpo trae códigos en `problems` |
| `500` | El chequeo mismo falló (`{"error":"internal"}`; el detalle queda en el log del servidor) |

Cuerpo (conjunto cerrado, sin ids, nombres, URLs ni claves):
```json
{ "status": "ok", "problems": [], "version": "a1b2c3d", "lastMigration": "20261102200000",
  "checks": { "overdueHolds": 0, "staleFeeds": 0, "failingFeeds": 0 } }
```

## Cómo se detecta cada cosa
Los cron no dejan registro de ejecuciones, así que se mide su **efecto**:
- `holds_not_expiring`: hay reservas `pending_payment` con más de 30 min de retraso sobre su `expires_at` (y sin voucher en
  revisión, que el job deja a propósito). El job corre cada 15 min: 30 min = al menos dos ejecuciones perdidas.
- `ical_sync_stalled`: hay calendarios con URL cuyo último intento tiene más de 1 h (se vuelven a intentar a los 10 min).
  **Límite**: sin ningún calendario con URL no hay señal y no se puede saber si ese cron corre.
- `failingFeeds` es solo informativo: suele ser la URL del canal, no la instalación.
- Además el monitor compara `lastMigration` con la última migración del repo y avisa si la base lleva **más de 24 h**
  atrasada (la ventana cubre el tiempo que tardas en aprobar el despliegue).

## Cómo funciona la alerta
Workflow `.github/workflows/installation-health.yml`: cada hora, un job por instalación del registro
(`deploy/installations.json`). Falla si no hay respuesta, si responde `401`/`5xx`, si está degradada o si la base está atrasada.
Reintenta 3 veces (10 s entre intentos) para no alertar por un arranque en frío.
Una instalación **sin configurar** no falla: deja un aviso amarillo «NOT MONITORED» en la ejecución.

Cada instalación usa un segundo Environment, `health-<id>`, **distinto** de `supabase-<id>`:
- **sin** Required reviewers (si no, cada ejecución quedaría esperando un clic),
- Deployment branches = solo `main`,
- Variable `HEALTH_URL` = `https://app.<dominio>/api/health` y secreto `HEALTH_SECRET`.
Ese secreto solo permite **leer** conteos: no toca ninguna base ni dispara ningún cron (por eso es distinto de `CRON_SECRET`).

## Configurar una instalación (pasos exactos)
1. Mira el valor: `jq -r .healthSecret .install/<slug>.state.json` (lo generó `install-client`; en la instalación nº 1 genéralo
   con `openssl rand -hex 32` y guárdalo también en Vercel como `HEALTH_SECRET`, sensible, solo producción, y redespliega).
2. Crea el Environment y carga los valores (sustituye `<id>` por el id del registro):
   ```bash
   gh api -X PUT repos/vadickpb/saywalodges/environments/health-<id> --input - <<'JSON'
   {"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
   JSON
   gh api -X POST repos/vadickpb/saywalodges/environments/health-<id>/deployment-branch-policies -f name=main -f type=branch
   gh variable set HEALTH_URL --env health-<id> --repo vadickpb/saywalodges --body https://app.<dominio>/api/health
   gh secret set HEALTH_SECRET --env health-<id> --repo vadickpb/saywalodges   # pega el valor del paso 1
   ```
3. Prueba: Actions → *Installation health* → **Run workflow** (campo `installation` = `<id>`). Debe quedar en verde con
   «Installation <id>: healthy.».
4. Verifica que GitHub te avisa: Settings (tu perfil) → Notifications → *Actions* → «Send notifications for failed workflows
   only» activado.

## Probar que la alerta funciona
Cambia a propósito el secreto `HEALTH_SECRET` del Environment `health-<id>` por otro valor y lanza el workflow: debe fallar con
«401: HEALTH_SECRET differs…» y llegarte el correo. Restaura el valor.

## Si llega una alerta
| Mensaje | Qué hacer |
|---|---|
| no answer from the installation | Abre `https://app.<dominio>`; revisa Vercel (deploy fallido, dominio, plan) |
| 401: HEALTH_SECRET differs | El secreto de `health-<id>` y el de Vercel no coinciden: iguálalos y redespliega |
| expire-holds cron is not running | Revisa el cron de `expire-holds` (`docs/cron.md`, runbook paso 7) |
| ical-sync cron is not running | Revisa el cron de `ical-sync` |
| database is behind the repository | Aprueba el despliegue pendiente en Actions → *Deploy database* |
