# Versiones (SD-903)

`release-please` mantiene un PR «chore(main): release X.Y.Z» con el `CHANGELOG.md` y el número de versión calculado de los
Conventional Commits (`feat` → menor, `fix` → parche, `feat!` o `BREAKING CHANGE` → mayor; mientras sea 0.x, un cambio
mayor sube solo el menor). Al mergear ese PR se crea la etiqueta `vX.Y.Z` y una *Release* en GitHub.

| Rama / etiqueta | Qué recibe |
|---|---|
| `main` | La demo (Vercel despliega cada merge) |
| `vX.Y.Z` | Las instalaciones de clientes: el dueño actualiza un cliente solo a una versión etiquetada |

## Primera versión estable (v1.0.0)

Cuando el lote 6 esté completo, crea un commit vacío en `main` (por un PR) con el pie `Release-As: 1.0.0`:

```
git commit --allow-empty -m "chore: first stable release" -m "Release-As: 1.0.0"
```

release-please abrirá el PR de la versión 1.0.0.

## Nota sobre CI en el PR de versión

Los PRs que crea `GITHUB_TOKEN` no disparan otros workflows, así que el PR de versión puede no mostrar los checks de CI. Es un
PR que solo cambia `package.json`, `CHANGELOG.md` y el manifiesto: el CI de `main` ya validó cada commit. Si la protección de `main`
exige los checks, ciérralo y reábrelo (dispara CI) antes de mergear.

## Actualizar un cliente

1. Revisa el `CHANGELOG.md` y si hay migraciones nuevas.
2. Despliega la base de datos con *Deploy database* (apruebas tú) y luego el código en la versión etiquetada.
3. Comprueba `/api/health` de esa instalación.
