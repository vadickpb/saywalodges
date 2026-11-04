# Manual del coordinador (Claude Code)

Instrucciones para la sesión de Claude Code que coordina la cola (SD-901). El dueño la arranca escribiendo
`continúa`, `estado` o `dale al lote N`. Para que trabaje sola, el dueño puede usar
`/loop sigue la cola según docs/coordinador.md`.

## Cada vuelta

1. **Leer el estado** (barato): `docs/cola.md`, `gh pr list --state open`, el estado de los worktrees de Orca
   y los runs de *Deploy database* esperando. No releer el roadmap entero: solo el ticket que toca.
2. **PRs abiertos**, por orden:
   - CI rojo → arreglarlo encima de la rama (o pedírselo a su worker de Codex).
   - `risk:low` con CI verde → nada que hacer si el auto-merge está activo; si no, squash merge con
     `--match-head-commit`.
   - `risk:high` → un `reviewer` (+ `security-reviewer` si toca lo que lista `CLAUDE.md`), **una ronda**,
     aplicar hallazgos, merge con CI verde. Relanzar revisores solo si hubo algo alto/crítico o cambió el
     diseño.
   - Conflicto con `main` → `git rebase origin/main` en su worktree (sin `--force`: se crea una rama nueva o
     se mergea `main` en la rama).
3. **Después de cada merge**: marcar `hecho` en la cola, limpiar el worktree, y si había migración avisar al
   dueño del run que debe aprobar.
4. **Lanzar trabajo** hasta tener como máximo 3 tickets en curso, del lote aprobado, que no toquen los mismos
   archivos:
   - `Codex` → `orca worktree create --name SD-XXX-slug --repo id:<repo> --base-branch origin/main
     --branch <type>/SD-XXX-slug --agent codex --prompt "<brief>"`, con el brief de la plantilla de abajo.
   - `Claude` → worktree propio y skill `ticket`.
5. **Fin de lote**: cuando todos están `hecho`, escribir al dueño «Lote N listo para revisar» con una lista
   corta de qué comprobar en la demo. No arrancar el lote siguiente sin `dale al lote N+1`.
6. **Decisiones de negocio**: nunca bloquear el lote preguntando. Anotar la decisión en
   `docs/decisiones-pendientes.md`, seguir con la recomendación si es reversible, o con otro ticket si no.
7. **Avisar al dueño solo si**: hay migración que aprobar, el lote terminó, o algo grave no se resuelve en una
   ronda. Siempre con el bloque «Te toca a ti».

## Esperar sin gastar

- Mientras Codex trabaja, no consultar su carpeta cada pocos minutos: en `/loop`, programar la siguiente
  vuelta a 20–30 minutos.
- Una sesión por lote: al cerrar un lote, proponer al dueño abrir sesión nueva.

## Plantilla de brief para Codex

```
# Encargo Codex: SD-XXX <título>
Lee AGENTS.md, CLAUDE.md, docs/workflow.md y el ticket SD-XXX de docs/roadmap.md.
Rama: <type>/SD-XXX-slug (ya creada en este worktree desde origin/main).
Alcance: <2–6 líneas: qué hacer y qué no>.
Reglas: nunca BD remota; migraciones solo en supabase/migrations/ con `npx supabase@2.122.0`; zod para input;
nunca error.message al cliente; UI es/en en dictionaries/; Conventional Commits en inglés.
Antes del PR: npm run lint && npm run typecheck && npm run test && npm run build (+ db reset y test db si
tocas SQL). Después, autorrevisa el diff completo contra main en contexto limpio (/review) y arregla lo que
encuentres. Abre el PR con la plantilla y marca el ticket en docs/roadmap.md.
NO mergees, NO hagas push a main, NO fuerces push. Termina con un resumen de 5 líneas.
```
