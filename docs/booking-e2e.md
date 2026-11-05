# E2E de reservas (SD-410)

El test Playwright usa Chromium y el build de producción de Next.js contra **Supabase local**.
No necesita credenciales remotas ni cambios de esquema. `@playwright/test` es una dependencia de
desarrollo porque Vitest no ejecuta el navegador, sus cookies, la subida a Storage ni las server actions reales.
La configuración sigue la guía instalada en `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md`
y el [servidor administrado de Playwright](https://playwright.dev/docs/test-webserver).

## Ejecutar

Requisitos: Node 24+, Docker en marcha, puerto 3410 libre y un worktree **sin** `.env`, `.env.local`,
`.env.production` ni `.env.production.local`. Usa un worktree separado si desarrollas con `.env.local`;
el runner rechaza esos archivos para impedir que Next cargue credenciales de otra base.

```bash
npm ci
npx playwright install --with-deps --only-shell chromium
npx supabase@2.122.0 start
# Solo si tu stack local no tiene las migraciones/seed actuales; borra sus datos locales:
npx supabase@2.122.0 db reset
npm run test:e2e
# Estabilidad: tres recorridos consecutivos, sin reintentos automáticos.
npm run test:e2e -- --repeat-each=3
```

El runner consulta `npx supabase@2.122.0 status -o json`, exige exactamente
`http://127.0.0.1:54321`, compila con su anon key local y configura `ROOT_DOMAIN=localhost:3410`.
Playwright arranca y detiene su propio `next start`; falla si otro proceso ocupa ese puerto.
No reutiliza un servidor de desarrollo. La app recibe una service-role ficticia: todo el recorrido depende
exclusivamente de anon y de la sesión del dueño. Las fixtures obtienen la service-role real **local** de la CLI.
No hace falta configurar cuentas de pago: la página permite subir el comprobante aunque aún no haya cuentas.

## Qué cubre

1. Huésped sin sesión cotiza en `http://saywa-lodges.localhost:3410/es/cotizar` con dos huéspedes y dos noches.
2. Completa nombre, correo y aceptación de términos en el checkout real; llega a la reserva esperando pago.
3. Sube un PNG real al bucket privado desde el navegador; la página pasa a **Pago en revisión**.
4. En otro contexto de navegador, el dueño del seed (`owner@saywalodges.com` / `devpassword123`) inicia sesión,
   abre `/app/bookings` → **Comprobante por revisar**, lee el comprobante autenticado y aprueba con cambio `3.75`.
5. El panel muestra **Confirmada** y **Aprobado**; al recargar, el huésped ve **Reserva confirmada**.
6. La base contiene exactamente una reserva de USD 440 (44000 céntimos) y un bloqueo `[llegada,salida)` permanente
   (`expires_at IS NULL`), y una nueva cotización de esas mismas fechas es rechazada en la UI pública.

Cada ejecución añade una unidad con UUID y tarifas de USD 22000 céntimos para la base y todas las temporadas
del seed. Las fechas se calculan desde el día actual en Lima (+60/+62 días), dentro del límite de la RPC;
no depende del año del seed ni del huso horario de la máquina. No crea reservas, pagos ni aprobaciones por API:
esas operaciones suceden en el navegador. La API privilegiada solo prepara inventario, verifica persistencia
y limpia sus propios archivos, pagos, asiento financiero, bloqueo, reserva, cotizaciones, unidad y huésped en `finally`.
No modifica las tarifas, cuentas ni propiedad del seed y no hace `db reset` automáticamente.
Si se mata el proceso durante el test, puede quedar una unidad `E2E <uuid>`; un reset **local** la elimina.

## CI y fallos

El job independiente **booking e2e (local Supabase)** de `.github/workflows/ci.yml` arranca un stack fresco
con la CLI fijada en 2.122.0, instala Chromium, compila y ejecuta tres recorridos sin retries.
Tiene un presupuesto máximo de cinco minutos para todo el job; los jobs existentes no cambian.
El límite interno de Playwright es de tres minutos y cada recorrido tiene un minuto.

Ante un fallo, revisar la aserción del log y `test-results/` local. Para ver una traza:

```bash
npx playwright show-trace test-results/<directorio-del-fallo>/trace.zip
```

Las trazas y capturas se ignoran en Git y no se publican como artefactos de CI: contienen sesiones y tokens
capability de prueba. No adjuntar trazas de reservas reales. Un fallo no se oculta con retries ni sleeps fijos;
las esperas se basan en URLs, elementos accesibles y respuestas reales.
