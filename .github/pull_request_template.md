## Ticket

Closes SD-XXX

## Qué cambia

<!-- Resumen en 2–4 viñetas, orientado al comportamiento. -->

## Cómo se probó

- [ ] `npm run lint` · `npm run typecheck` · `npm run test` · `npm run build`
- [ ] `npx supabase db reset && npx supabase test db` (si hay migraciones)
- [ ] Prueba manual: <!-- flujo y host usados -->

## Base de datos

- [ ] Sin cambios de esquema
- [ ] Migraciones nuevas con RLS y tests pgTAP <!-- listar -->

## Review

- [ ] `reviewer`
- [ ] `security-reviewer` (obligatorio si toca BD, auth, DAL, pagos, uploads, iCal o acciones públicas)
- Hallazgos descartados y por qué:

## Riesgos / despliegue

<!-- Variables de entorno nuevas, pasos manuales, compatibilidad con datos existentes. -->

## Capturas

<!-- Si hay cambios de UI. -->
