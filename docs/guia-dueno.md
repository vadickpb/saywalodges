# Guía del dueño: cómo se trabaja y qué te toca

Esta guía es para ti (Vadick). Explica cómo avanza el proyecto casi solo y cuál es tu labor diaria. El detalle
técnico para los agentes está en [`docs/workflow.md`](workflow.md).

## La idea en una frase

Tú decides **qué** se hace y **si está bien**; los agentes hacen el **cómo**, y GitHub comprueba que nada roto
llegue a `main`.

## Quién es quién

| Pieza | Qué hace |
|---|---|
| **Tú (dueño)** | Apruebas lotes, apruebas migraciones con 1 clic, revisas la demo, tomas decisiones de negocio. |
| **Claude Code (coordinador)** | Lee la cola, reparte tickets, implementa lo delicado (BD, dinero, seguridad), revisa lo de riesgo alto, mergea y te avisa. |
| **Codex (en Orca)** | Implementa pantallas, CRUD, textos, tests y docs. Cada ticket en su worktree y su rama. Se autorrevisa y abre el PR. |
| **GitHub** | CI (lint, tipos, tests, build, pgTAP), etiqueta de riesgo, auto-merge de lo de riesgo bajo, despliegue de BD con tu aprobación. |
| **Vercel** | Despliega solo lo que entra a `main`. |

## Los tres archivos que importan

1. [`docs/cola.md`](cola.md): qué se está haciendo, qué sigue y quién lo hace.
2. [`docs/decisiones-pendientes.md`](decisiones-pendientes.md): lo único que espera una respuesta tuya.
3. [`docs/roadmap.md`](roadmap.md): qué es exactamente cada ticket y sus criterios de aceptación.

## Tu labor diaria (5–10 minutos)

1. **Mira el celular/correo.** GitHub te avisa cuando hay un *Deploy database* esperando. Ábrelo →
   **Review deployments** → marca `supabase-production` → **Approve and deploy**. Si hay varios esperando,
   aprueba **solo el más reciente** (aplica todas las migraciones pendientes).
2. **Abre Claude Code** en `~/Developer/saywa-direct` y escribe una sola palabra:
   - `estado` → te resume el lote, los PRs y lo que te toca.
   - `continúa` → retoma la cola donde quedó (después de cerrar la Mac, por ejemplo).
3. **Si tienes un minuto**, responde una fila de `decisiones-pendientes.md` (por ejemplo «D2: sí»).

Eso es todo. No hace falta revisar cada PR ni probar cada cambio.

## Tu labor por lote (cada pocos días, ~20 minutos)

1. Cuando un lote termina, Claude te escribe **«Lote N listo para revisar»** con una lista corta de qué
   mirar y dónde.
2. Abres la demo (o `npm run local` si prefieres local) y compruebas esa lista.
3. Respondes:
   - `ok lote N` → se cierra el lote. Claude te propone el siguiente.
   - `esto no: <qué viste>` → Claude crea un ticket de arreglo y lo pone primero en la cola.
4. Para arrancar el siguiente lote: `dale al lote N+1`.

## Cómo avanza un ticket (sin ti)

```
pendiente en la cola
  → Claude lo asigna (Codex o Claude) y lo pone «en curso»
  → worktree + rama propios en Orca (~/orca/workspaces/saywa-direct/SD-XXX)
  → implementación + tests + autorrevisión → PR
  → GitHub: CI + etiqueta risk:low / risk:high
       risk:low  → se mergea solo con CI verde
       risk:high → Claude revisa (+ seguridad), arregla en una ronda, mergea con CI verde
  → si trae migración: te llega el aviso de aprobar (1 clic)
  → la cola pasa a «hecho» y arranca el siguiente ticket del lote
```

`risk:high` = toca base de datos, permisos, pagos, Storage, auth, rutas `api`, server actions, variables de
entorno, dependencias o CI. Todo lo demás es `risk:low`.

## Cuándo sí te necesitamos (y solo entonces)

| Situación | Qué haces |
|---|---|
| Migración esperando | 1 clic en GitHub (arriba). |
| Lote terminado | Revisar la demo y decir `ok lote N`. |
| Decisión de negocio | Responderla en `decisiones-pendientes.md` o en el chat. |
| Paneles externos (Vercel, Supabase, Meta, dominios, secretos) | Claude te da los pasos exactos; los agentes no tienen esos accesos a propósito. |
| Algo grave (CI rojo que no se arregla, conflicto de diseño) | Claude te avisa con opciones y una recomendación. |

## Si quieres ver un PR concreto en local

Cada worktree de Orca ya es una copia lista del proyecto. No cambies de rama en tu carpeta:

```
cd ~/orca/workspaces/saywa-direct/SD-XXX-nombre
npm run local
```

Si el PR no tiene worktree: `cd ~/Developer/saywa-direct && git fetch origin <rama> && git checkout --detach FETCH_HEAD`.
Si una salida termina en `(END)`, pulsa `q`.

## Importar el historial de Airbnb

1. En Airbnb entra a **Menú > Ganancias > Descargar CSV** y descarga el período que quieres incorporar.
   Las fechas deben tener formato **M/D/YYYY** (mes/día/año; por ejemplo, `10/25/2026`).
2. Como dueño, abre **Finanzas > Importar historial de Airbnb**, elige el CSV (máximo 2 MB) y pulsa
   **Ver vista previa**. Revisa reservas, ingresos brutos, comisiones y filas omitidas.
   Las transferencias al banco se muestran como referencia: no se cuentan otra vez como ingreso.
3. Empareja cada espacio de Airbnb con una casa. Si hay reservas en dólares, indica el
   **Tipo de cambio (S/ por 1 USD)**. Pulsa **Importar** y revisa el resultado.

Puedes importar el mismo archivo otra vez con seguridad: las reservas duplicadas o ya registradas se
omiten. Las estadías que aún no terminan llegan por el calendario y no se importan como ingresos históricos.
Si eliges otro CSV, vuelve a revisar la vista previa y emparejar sus espacios.

## Importar casas y tarifas

1. Como dueño, abre **Sitio > Unidades reservables > Importar desde CSV** y pulsa **Descargar plantilla**.
2. Completa una fila por casa o habitación con precios en la moneda de tu propiedad, elige el CSV y pulsa **Ver vista previa**; revisa también las filas omitidas y sus motivos.
3. Pulsa **Confirmar importación** y revisa cuántas casas se crearon o actualizaron; un nombre existente actualiza sus datos y su tarifa base.

## Ahorrar tokens (y dinero)

- **Una sesión de Claude por lote.** Al empezar un lote, abre una sesión nueva: la memoria y `docs/cola.md`
  conservan el contexto.
- **Modelo**: `/model` → Sonnet para el día a día (coordinar, revisar riesgo bajo, mergear). Opus solo cuando
  el lote tiene tickets de Claude con BD/dinero/seguridad.
- **Pega solo el error**, no toda la terminal.
- Lo pesado (pantallas, tests) lo hace Codex con su propia cuota.

## Configuración única (una vez, ~10 minutos)

Sin esto el auto-merge queda apagado y todo sigue funcionando como antes (Claude mergea a mano).

1. **Proteger `main`**: GitHub → repo → *Settings* → *Branches* → *Add branch ruleset* (o *Add rule*) para
   `main`: activar *Require a pull request before merging* (0 aprobaciones) y *Require status checks to pass*
   con `lint, typecheck, test, build` y `supabase db reset, pgTAP`.
2. **Permitir auto-merge**: *Settings* → *General* → *Pull Requests* → marcar **Allow auto-merge**.
3. **Encender el auto-merge de SD-901**: *Settings* → *Secrets and variables* → *Actions* → pestaña
   *Variables* → *New repository variable*: nombre `AUTO_MERGE`, valor `true`. Para apagarlo, bórrala.
4. **Menos avisos de permisos en Claude Code**: escribe `/fewer-permission-prompts` en Claude Code y acepta
   la lista que proponga (solo comandos de lectura y de prueba).
5. **Avisos al celular**: activa las notificaciones de GitHub (app móvil) para *Deployments* y *Actions*.

### Bloquear fechas desde el calendario

1. En `/app/calendar`, selecciona el mes y una unidad y pulsa **Ver calendario**.
2. Toca el día de inicio y la fecha de salida (queda libre); en escritorio también puedes arrastrar entre ambos días.
3. En el panel inferior, revisa las noches, añade una nota opcional y pulsa **Bloquear fechas**; toca un bloqueo manual para ver su detalle o eliminarlo.
