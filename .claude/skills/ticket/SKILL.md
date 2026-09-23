---
name: ticket
description: Workflow estándar para implementar un ticket de Saywa Direct de principio a fin (rama, plan, BD, implementación vertical, tests, verificación, review, PR). Usar al empezar cualquier ticket del roadmap (ids tipo SD-XXX) o cualquier feature/fix no trivial.
---

# Workflow de ticket

## 1. Preparar
- Localiza el ticket en `docs/roadmap.md` (o el issue de GitHub) y relee sus criterios de aceptación
  y dependencias. Si una dependencia no está hecha, detente y avisa.
- Parte de `main` actualizado: rama `<type>/<ticket-id>-<slug>` (ej. `feat/SD-041-quote-link`).

## 2. Entender y planificar
- Lee los archivos afectados antes de proponer nada.
- Si el ticket toca BD, seguridad o más de dos capas: plan corto en plan mode y espera aprobación.
  Si no, un plan de 3 líneas en el chat basta.
- Si implica una decisión de arquitectura nueva, redacta un ADR en `docs/adr/NNNN-slug.md`.

## 3. Base de datos primero (si aplica)
- Sigue la skill `db-migration`.

## 4. Implementar en vertical
Orden: `lib/domain` (+ tests) → `lib/dal` → server action / route (zod) → UI.
Escribe los tests junto al código, según la skill `testing`. No amplíes el alcance del ticket:
anota lo que encuentres fuera de alcance como propuesta de ticket nuevo.

## 5. Verificar
- `npm run lint && npm run typecheck && npm run test && npm run build`
- Si hubo migraciones: `npx supabase db reset && npx supabase test db`.
- Prueba el flujo real en `*.localhost:3000` cuando haya UI.
- Recorre cada criterio de aceptación y marca cuáles quedaron cubiertos y cómo.

## 6. Review
- Lanza `reviewer` y, si el diff cae en las áreas listadas en `CLAUDE.md`, `security-reviewer`
  en paralelo.
- Corrige todo lo crítico/importante. Si descartas un hallazgo, justifícalo en el PR.

## 7. Cerrar
- Commits en Conventional Commits, con el id del ticket en el cuerpo (`Refs: SD-041`).
- Pide confirmación antes de `git push` y de abrir el PR.
- PR con `.github/pull_request_template.md` completo. Squash merge con CI en verde.
- Marca el ticket como hecho en `docs/roadmap.md`.
