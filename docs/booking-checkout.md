# Checkout del enlace de reserva (SD-403)

Ruta pública: `/{lang}/reservar/{token}` (`es` / `en`). Al convertir la cotización o volver a abrir una ya
convertida, se redirige a `/{lang}/reserva/{public_token}`. El token es una credencial: no copiar enlaces reales
en logs, capturas públicas o incidencias. El enlace de la cotización equivale a acceso al estado de la reserva:
quien lo conserve puede obtener el `public_token` de la reserva original al volver a abrirlo.

## Contrato y seguridad

- `get_quote_checkout(host, token)` usa anon, exige propiedad publicada y host coincidente. Un token
  malformado, desconocido, vencido o de otro tenant produce `null`, con la misma pantalla y WhatsApp de la
  propiedad del host. Una cotización convertida devuelve solo `public_token`, incluso después de vencer.
- El resumen no consulta ni devuelve `breakdown`. Importes, saldo, fechas y moneda vienen de columnas.
- La acción valida token, nombre, correo, teléfono y aceptación con zod; descarta los demás campos.
  Lee el host del encabezado de la petición, comprueba la cotización y usa la RPC anon existente.
  La RPC sigue siendo una capacidad por token y conserva su transacción. Las nuevas conversiones exigen
  una propiedad publicada, también al llamar directamente con anon; el rechazo es `22023` antes de escribir.
  El nombre rechaza caracteres Unicode de control/formato y separadores de línea/párrafo (Cc/Cf/Zl/Zp) antes de recortarse, tanto en zod como
  en SQL (rangos explícitos). Ambas capas recortan los mismos espacios Unicode de los extremos y exigen
  de 1 a 200 puntos de código tras recortar; un nombre de solo NBSP o espacio ideográfico no es válido.
  U+200C/U+200D (ZWNJ/ZWJ, formato) se rechazan a propósito aunque se usen en algunos nombres persas
  e índicos. Si producto decide permitirlos, se permitirán solo entre letras y en ambas capas a la vez.
  NUL no es representable en `text` de PostgreSQL y se rechaza al decodificar.
- `create_booking_from_quote` devuelve `public_token` en creación y repetición. Un replay de una cotización
  ya convertida redirige a la reserva original e ignora los datos del segundo envío: los campos aún deben
  superar la validación de entrada, pero no cambian el huésped ni crean una reserva o bloque adicionales.
  La comprobación de publicación sucede después del replay; este sigue funcionando directamente en la RPC
  aunque el sitio se haya despublicado. La lectura pública del checkout sigue exigiendo publicación. Mantiene
  `FOR UPDATE`, la reserva única por cotización y la exclusión de fechas. No altera tablas, RLS ni grants existentes.
- Metadatos `noindex,nofollow` y `no-referrer`; WhatsApp también lleva `noreferrer`. No se añaden analíticas ni
  scripts de terceros. Los únicos datos de errores de BD registrados por esta implementación son códigos.
- `dictionaries/checkout-policies.ts` es la fuente única de políticas/términos, con `TODO(owner)` en ambos idiomas.
  Los textos actuales avisan de que falta publicarlos; no establecen reglas de cancelación ni reembolso.

## Verificación local con Supabase disponible

Docker no funciona en la máquina de implementación. pgTAP y la migración se validan en el job de CI
`supabase db reset, pgTAP`; las pruebas Vitest de página/DAL/acción usan fixtures, no una base remota.
También se verificó por HTTP el renderizado real de Next en es/en con una API sintética local:
resumen/formulario, metadatos de privacidad y pantalla inválida con WhatsApp. No se pudo inspeccionar
visualmente en navegador porque la herramienta devolvió “browser access host is unavailable”.

En un equipo con Docker, desde este worktree y la rama `feat/SD-403-booking-checkout`:

1. Ejecutar `npx supabase start`, `npx supabase db reset` y `npx supabase test db`.
2. Configurar `.env.local` con las credenciales **locales** de `npx supabase status -o env`, según `.env.example`;
   usar `ROOT_DOMAIN=localhost:3000`. Ejecutar `npm run dev`.
3. Entrar en `http://app.localhost:3000/app/quotes` con el dueño local de Saywa, seleccionar fechas disponibles
   futuras y generar una cotización. Abrir el enlace generado en una ventana privada.
4. En `http://saywa-lodges.localhost:3000/es/reservar/{token}`, verificar nombre de unidad, fechas, huéspedes,
   importes, vencimiento y minutos de retención. Repetir con `/en/` y en un viewport de 375 px.
5. Enviar sin aceptar términos y con correo inválido: debe enfocarse el primer campo inválido, con mensaje
   asociado por `aria-describedby` y `aria-invalid`; se conservan los datos escritos. Enviar datos válidos y aceptar: el botón se deshabilita
   mientras envía y se llega a `/es/reserva/{public_token}`. Reabrir la cotización: misma página de estado.
6. Abrir `/es/reservar/invalido` y una cotización vencida sin reserva: misma pantalla clara con WhatsApp de
   Saywa. Abrir un token de Saywa bajo `http://demo.localhost:3000/es/reservar/{token}`: misma pantalla con
   WhatsApp de Demo. No debe aparecer el resumen de Saywa.
7. Para fechas ocupadas, crear dos cotizaciones solapadas antes de reservar: convertir la primera y enviar
   la segunda; debe pedir otra cotización por WhatsApp. `0023_quote_checkout.test.sql` comprueba también
   que el doble envío devuelve la misma reserva/token y no crea otro huésped.
8. Dejar vencer una cotización mientras se completa el formulario: al enviar, debe indicar enlace no
   disponible y ofrecer WhatsApp, sin pedir corregir campos. Con unidad inactiva o capacidad insuficiente,
   debe pedir una cotización nueva. Un fallo de lectura de infraestructura debe mostrar error genérico con
   botón **Reintentar**, sin afirmar que el enlace es inválido.
9. En DevTools, verificar `meta[name=robots]`, `meta[name=referrer]` y ausencia de scripts/analíticas de
   terceros. El enlace WhatsApp no incluye el token ni envía Referer.

## Producción y revisión pendiente

PR apilado sobre #46: **no mergear** hasta completar las correcciones de `reviewer` y `security-reviewer` de Claude
y verificar el CI actualizado. Primero se mergea #46, después se cambia la base de SD-403 a `main` y se verifica CI del último
commit. La migración es aditiva; sin ella el checkout muestra error genérico con reintento y no permite convertir.

### Te toca a ti

- Revisiones `reviewer` y `security-reviewer` realizadas por Claude: verificar sus correcciones en el PR SD-403
  y esperar el merge de #46 antes de continuar con el merge de SD-403.
- Antes de compartir enlaces reales, sustituir los `TODO(owner)` de `dictionaries/checkout-policies.ts` por los
  textos aprobados en es/en y verificar que aparecen en ambas rutas. Sin esto, los términos siguen pendientes.
- Después del merge autorizado, abrir https://github.com/vadickpb/saywalodges/actions/workflows/deploy-db.yml,
  entrar en la ejecución correspondiente → **Review deployments** → `production` → **Approve and deploy**.
  Verificar el job verde y `20261101233822` en *Migrations after*, columnas Local y Remote. Sin aprobación,
  el checkout no estará operativo. No ejecutar `supabase db push` contra producción.
- Para la prueba local completa, usar los pasos anteriores en un equipo con Docker; el flujo con BD no se
  pudo ejecutar en la máquina actual. Sin esta prueba queda pendiente la comprobación interactiva completa.

## Pago manual con voucher (SD-405)

Tras reservar, el huésped llega a `/[lang]/reserva/[public_token]`. Mientras la reserva sea **pagable** (estado `pending_payment`, retención vigente y sin
comprobante en revisión) la página muestra el adelanto, las cuentas activas de la propiedad en la moneda de la reserva y el formulario del comprobante.
Fuera de esa ventana el `public_token` ya no revela cuentas ni permite subir nada (hallazgo H2 de la revisión de SD-403).

- **Subida**: el navegador sube el archivo (JPG, PNG, WebP o PDF, máx. 5 MB) **directo** al bucket privado `payment-vouchers`, en
  `<org_id>/<public_token>/<uuid>.<ext>`. La política de Storage solo lo permite para esa carpeta, mientras la reserva es pagable y hasta 5 archivos por reserva.
- **Registro**: el servidor llama a `submit_payment_voucher`, que comprueba la carpeta, que el archivo exista y que no haya otro en revisión, y crea el pago
  `pending_review` con el **monto y la moneda de la reserva**. Un comprobante en revisión mantiene la retención (el barrido de `expire_holds` lo respeta).
- **Lectura**: solo miembros de la organización, con URL firmada de 60 s (`lib/dal/payment-vouchers.ts`). Nadie puede modificar ni borrar un comprobante por la API.

### Riesgos conocidos y su mitigación
- **Un comprobante basura mantiene la retención**: mientras un pago está `pending_review`, el barrido no libera las fechas; si alguien con el enlace sube un
  archivo falso, las fechas quedan bloqueadas hasta que el dueño lo rechace. Por diseño (un comprobante real no debe perder la reserva). Mitigación: el dueño debe
  revisar a tiempo; SD-406 destacará los comprobantes con muchas horas en revisión y SD-1009 avisará por WhatsApp de cada comprobante nuevo.
- **Archivos sin limpieza**: no hay purga de comprobantes huérfanos, rechazados ni de organizaciones borradas (SD-412). El tope de ~5 archivos por reserva no impide
  subidas paralelas que lo superen un poco; lo acota el límite de reservas anónimas (SD-409).
- **Tipo de archivo declarado**: Storage valida el `Content-Type` que declara el navegador, no los bytes. Las URLs firmadas se sirven desde el origen de Supabase (no desde la app),
  pero SD-406 debe mostrar imágenes con `<img>` y abrir los PDF como descarga.

### Probarlo en local
1. `npx supabase@2.122.0 db reset` y `npm run dev` con las variables de `docs/booking-checkout.md`.
2. En el panel crea una cotización, ábrela como huésped y reserva; entra a la página de la reserva. Sin cuentas configuradas verás el aviso de coordinar por WhatsApp
   (la pantalla para configurarlas es SD-411). Para ver el panel completo inserta una cuenta de prueba:
   `insert into property_payment_accounts(org_id, property_id, kind, holder_name, phone, currency) values (...)` con la moneda de tu reserva.
3. Sube una foto: la página debe pasar a «Pago en revisión» y desaparecer el formulario.
4. Comprueba que el archivo NO es público: `GET /storage/v1/object/public/payment-vouchers/...` falla; solo una sesión de miembro obtiene una URL firmada.

## Gestión de reservas del dueño (SD-406)

En el panel, **Reservas** (`/app/bookings`):
- **Lista** con filtros por estado (Todas, *Comprobante por revisar*, Esperando pago, Confirmadas, Canceladas, Vencidas) y por fecha de llegada; 20 por página.
  «Comprobante por revisar» son las reservas que esperan tu decisión: **revisa esa lista a diario**, porque un comprobante en revisión mantiene las fechas bloqueadas hasta que decidas.
- **Detalle** (`/app/bookings/[id]`): datos de la reserva y del huésped, y cada pago con su comprobante.
  - *Ver comprobante* abre el archivo con una URL firmada de 60 segundos (las imágenes se ven en el navegador; los PDF se descargan). El archivo nunca es público.
  - *Aprobar pago* confirma la reserva y registra el ingreso en tus finanzas. Si la reserva está en dólares puedes escribir el tipo de cambio (soles por dólar); si lo dejas vacío se usa
    el último registrado en tus finanzas, y si no hay ninguno el sistema te pide escribirlo.
  - *Rechazar comprobante* (con motivo opcional) deja que el huésped suba otro mientras la retención siga vigente.
  - *Cancelar reserva* libera las fechas; los pagos ya aprobados se conservan en finanzas (el reembolso se gestiona fuera del sistema).

### Probarlo en local
1. `npx supabase@2.122.0 db reset`, `npm run dev` y entra en `http://app.localhost:3000/login` con `owner@saywalodges.com` / `devpassword123` (si tu puerto 3000 está ocupado por otro servidor, usa otro puerto y ajusta `ROOT_DOMAIN`).
2. Crea una reserva con comprobante (ver «Pago manual con voucher»), abre **Reservas → Comprobante por revisar → la reserva** y prueba aprobar, rechazar y cancelar.
3. Comprueba que otra organización (`owner@demo.saywadirect.test`) no ve esa reserva ni su comprobante.
