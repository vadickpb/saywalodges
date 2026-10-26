<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Autonomía de PR y merge (Claude Code y Codex)

Desde 2026-10-26 el dueño del repo autorizó que el agente haga push, abra el PR y lo mergee (squash) **sin pedir
confirmación**, siempre que se cumpla TODO esto:

- Los checks de CI están en verde (`lint, typecheck, test, build` y, si hay migraciones, `supabase db reset, pgTAP`).
  Nunca se mergea con checks fallando o pendientes.
- `reviewer` y, cuando `CLAUDE.md` lo exige, `security-reviewer` ya corrieron y los hallazgos críticos/importantes
  están resueltos (o descartados con justificación en el PR).
- El PR sigue la plantilla y documenta los pasos manuales de producción, si los hay.
- PRs apilados: mergear primero la base y reorientar el hijo a `main`.

Siguen siendo del dueño y el agente **no** los hace: aplicar migraciones en la BD remota; correr scripts con la
service-role de producción; cambiar ajustes en los paneles de Vercel o Supabase; push directo a `main`;
`git push --force` en cualquiera de sus formas (incluida la bandera al final del comando); borrar ramas remotas;
`git reset --hard`, `git clean`; `gh pr merge --admin`. Si una migración debe aplicarse antes del deploy, el agente
mergea solo después de avisar y de que el dueño confirme que ya la aplicó.
