# Flujo de trabajo (humano + Claude Code + Codex)

Este es el documento único de proceso. `AGENTS.md` (Codex) y `CLAUDE.md` (Claude Code) lo referencian,
así que ambos agentes siguen las mismas reglas. Las autorizaciones y prohibiciones de autonomía viven en
`AGENTS.md`; aquí está el *cómo se trabaja* y *qué le toca al dueño*.

## Regla de oro

**1 ticket = 1 worktree = 1 rama = 1 PR = (como máximo) 1 migración.**

- Rama: `<type>/SD-XXX-slug` (`feat`, `fix`, `chore`, `docs`, `refactor`, `test`).
- Siempre se parte de `origin/main` actualizado, en un worktree propio (Orca u otro gestor de worktrees).
- Nunca dos agentes en el mismo worktree.
- Para saber dónde estás: `npm run where` (rama, PR, CI, migraciones y qué toca después).

## Ciclo de un ticket

```
elegir ticket (docs/roadmap.md)
  → worktree nuevo desde origin/main
  → plan corto (plan mode si toca BD, seguridad o >2 capas)
  → migración (si aplica; créala tras `git rebase origin/main` y edítala mientras el PR siga abierto)
  → dominio → DAL → acción/ruta (zod) → UI → tests
  → npm run lint && npm run typecheck && npm run test && npm run build
  → si hubo migración: npx supabase db reset && npx supabase test db
  → reviewer (+ security-reviewer si CLAUDE.md lo exige)
  → push → PR (plantilla completa) → CI verde → squash merge
  → si el PR trae migración: el dueño aprueba "Deploy database" (1 clic)
  → limpieza del worktree y la rama
```

El detalle de cada paso está en las skills `.claude/skills/ticket`, `db-migration` y `testing`.

## Quién hace qué

| | Claude Code | Codex | Dueño |
|---|---|---|---|
| Tickets con BD, RLS, auth, pagos, iCal, uploads | ✅ (tiene `reviewer` y `security-reviewer`) | Solo si el dueño lo pide | Elige el ticket |
| UI, textos, estilos, tests, docs, tareas aisladas | ✅ | ✅ | Elige el ticket |
| Revisión cruzada | Revisa lo que escribió Codex | Revisa lo que escribió Claude | — |
| Push, PR y squash merge | ✅ con CI verde | ✅ con CI verde | — |
| Aprobar el despliegue de migraciones | ❌ | ❌ | ✅ (un clic) |
| Paneles de Vercel/Supabase/GitHub, secretos | ❌ | ❌ | ✅ |

Quien escribió el diff no es el único que lo revisa: antes del merge lo mira el otro agente o los subagentes
`reviewer`/`security-reviewer`.

## Migraciones de base de datos

Por qué había tantas: cada arreglo generaba una migración nueva aunque la anterior ni siquiera estuviera en
producción. Las reglas que lo evitan:

1. **Una migración por ticket.** Mientras el PR está abierto (la migración aún no está en `main`), se
   **edita la misma migración** y se repite `npx supabase db reset && npx supabase test db`. No se crea otra
   para corregir un error propio.
2. **Una migración que ya está en `main` jamás se edita**: se crea una nueva (`supabase/CLAUDE.md`).
3. **Cambios aditivos primero.** Vercel despliega el código en cuanto se mergea, y la BD se actualiza cuando el
   dueño aprueba. Por eso una migración nunca debe romper el código anterior: se añaden tablas/columnas
   (nullable o con default), y los `drop`/`rename`/`not null` nuevos van en un ticket posterior
   (patrón *expand → contract*).
4. **Crear la migración al final, no al principio.** Haz `git fetch && git rebase origin/main` y entonces
   `npx supabase migration new <slug>`. Así el timestamp es posterior al de todo lo ya mergeado.
5. **Los PR con migración se mergean de uno en uno.** Si hay dos en vuelo, el segundo se rebasa sobre `main`
   después de que el primero se mergee.

### Despliegue a producción (la única parte manual)

El agente nunca toca la BD remota. Al mergear un PR que cambia `supabase/migrations/**`, GitHub ejecuta el
workflow **Deploy database** (`.github/workflows/deploy-db.yml`) y se **detiene esperando tu aprobación**.

Cómo aprobar (≈30 segundos):

1. Abre el correo/notificación de GitHub «Deploy database is waiting for review», o ve a
   `https://github.com/vadickpb/saywalodges/actions/workflows/deploy-db.yml`.
2. Entra en la ejecución más reciente (estado amarillo «Waiting»).
3. Pulsa **Review deployments** → marca `production` → **Approve and deploy**.
4. Espera a que el job termine en verde. En el paso «Migrations after» verás la migración nueva con su
   versión en las columnas *Local* y *Remote*.

Cómo comprobar que salió bien: la columna *Remote* del último paso lista la versión nueva, o en Supabase →
Database → Migrations aparece al final.

Si falla: **no lo vuelvas a ejecutar a ciegas**. Copia el enlace de la ejecución y pásaselo al agente
(«falló Deploy database: <enlace>»). El paso «Dry run» falla *antes* de cambiar nada si producción tiene
migraciones que el repo no tiene. Hasta que se resuelva, el código nuevo puede estar desplegado sin su
esquema; por eso la regla de cambios aditivos.

Fallo típico: «Found local migration files to be inserted before the last migration on remote database». Significa que
la migración tiene un timestamp anterior a otra ya aplicada (se creó antes de rebasar). Pide al agente que la
renombre con un timestamp nuevo tras `git rebase origin/main`; no uses `--include-all` sin entenderlo.

Si no apruebas: nada se rompe (el código es compatible con el esquema anterior), pero la funcionalidad nueva que
dependa de la migración no funcionará hasta que apruebes.

### Configuración única (una vez, ≈10 minutos)

En GitHub → Settings → Environments → **New environment** `production`:

1. **Required reviewers**: añádete a ti mismo. Deja *Prevent self-review* **desactivado** (eres el único dueño).
   **Deployment branches and tags** → *Selected branches and tags* → solo `main` (imprescindible: impide que una
   ejecución manual desde otra rama alcance los secretos).
2. **Secrets** del entorno:
   - `SUPABASE_ACCESS_TOKEN`: token personal en `https://supabase.com/dashboard/account/tokens`. Dale un nombre
     reconocible (p. ej. `github-deploy-db`) y rótalo de vez en cuando: da acceso de gestión a tu cuenta.
   - Créalos **solo en el environment**, nunca como secretos de repositorio (los de repositorio los lee cualquier workflow).
   - `SUPABASE_DB_PASSWORD`: contraseña de la BD (Supabase → Project Settings → Database).
3. **Variables** del entorno: `SUPABASE_PROJECT_ID` = el *Reference ID* del proyecto (Supabase → Project Settings → General).
4. Comprobación: Actions → *Deploy database* → **Run workflow**. Debe quedar en «Waiting»; apruébalo y el
   «Dry run» debe decir que la base remota está al día (*Remote database is up to date*).

## Protocolo de cierre: «Te toca a ti»

Todo ticket (o tarea) termina con este bloque, siempre, aunque esté vacío:

```
### Te toca a ti
- [ ] <qué>  — <dónde: rama/worktree/URL>  — <comando o clic exacto>  — <cómo verificar>  — <qué pasa si no se hace>
(o: «Nada pendiente para ti».)
```

Reglas para el agente: indicar la rama y el worktree trabajados; agrupar todo lo que necesite del dueño en
un solo bloque; escribir comandos completos y copiables; nunca dejar un paso implícito como «aplica la migración».

## Limpieza (después de cada merge)

El agente puede hacer la limpieza **local**. Borrar ramas **remotas** es del dueño (ver `AGENTS.md`); la forma
estable es activar *Automatically delete head branches* (Settings → General → Pull Requests), una sola vez.

```bash
# desde cualquier worktree, con el ticket ya mergeado:
git worktree remove <ruta-del-worktree>
git branch -d <rama>        # -d falla si no está mergeada, a propósito
git fetch --prune
```

`npm run where` lista los worktrees cuyo PR ya se mergeó.

## Por qué el repositorio vive fuera de iCloud

`~/Documents` se sincroniza con iCloud, que crea copias «archivo 2.ext» ante conflictos. Una copia así dentro de
`supabase/migrations/` duplica una versión y rompe `db reset`/`db push`. Ubicación recomendada del repo
principal: una carpeta fuera de `~/Documents`, `~/Desktop` e iCloud Drive (p. ej. `~/Developer/saywa-direct`).
