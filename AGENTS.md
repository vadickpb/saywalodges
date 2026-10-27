<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Autonomía de trabajo, PR y merge (Claude Code y Codex)

Desde 2026-10-26 el dueño autorizó avanzar en los tickets del roadmap acordado sin pedir aprobación en cada
paso. El agente comunica un plan corto, implementa, prueba y revisa; no espera otra confirmación para las
acciones comprendidas en ese alcance. Las decisiones de arquitectura siguen los ADRs del proyecto.

- **Push y creación del PR**: los hace el agente después de las verificaciones locales y las revisiones que
  exige `CLAUDE.md`, con hallazgos críticos/importantes resueltos o descartados con justificación en el PR.
  No requieren CI remoto previo: abrir el PR es lo que dispara ese CI.
- **Squash merge**: lo hace el agente solo cuando todos los checks remotos aplicables terminaron en verde
  para el último commit del PR (`lint, typecheck, test, build` y `supabase db reset, pgTAP` cuando corresponda).
  Nunca se mergea con checks fallando, pendientes o de un commit anterior. Usar `--match-head-commit` para
  que un nuevo push entre la comprobación y el merge obligue a verificar otra vez.
- El PR sigue la plantilla y documenta los pasos manuales de producción, si los hay.
- PRs apilados: mergear primero la base, reorientar el hijo a `main` y verificar su CI actualizado.

Siguen siendo del dueño y el agente **no** los hace: aplicar migraciones en la BD remota; correr scripts con la
service-role de producción; cambiar ajustes en los paneles de Vercel o Supabase; push directo a `main`;
`git push --force` en cualquiera de sus formas (incluidos `--force-with-lease`, `-f` y refspecs con `+`);
borrar ramas remotas (incluidos refspecs `:rama` y `gh pr merge --delete-branch`/`-d`); `git reset --hard`,
`git clean`; `gh pr merge --admin`, independientemente de la posición de la bandera. Si una migración debe
aplicarse antes del deploy, el agente mergea solo después de avisar y de que el dueño confirme que ya la aplicó.

Los patrones Bash de `.claude/settings.json` son una defensa adicional, no un analizador completo del shell.
Las prohibiciones anteriores obligan aunque una variante no coincida con un patrón; nunca se buscan formas
alternativas de ejecutar una operación prohibida. Esta configuración no sustituye la protección de ramas.
