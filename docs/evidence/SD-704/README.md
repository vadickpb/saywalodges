# Evidencia SD-704

Landing de plataforma: español en `/`, inglés en `/en`. Capturas de producción local a
375 × 812 (móvil, página completa) y 1440 × 1000 (escritorio, página completa), con Chrome headless.
No hay datos reales de clientes en las capturas. Los placeholders comerciales son intencionales.

## Verificación local

Desde el worktree `/Users/vadickpb/orca/workspaces/saywa-lodges/SD-704-landing`, rama
`feat/SD-704-saywa-direct-landing`, después de `npm ci`, sin credenciales de producción:

```sh
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=local-placeholder NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=local-placeholder ROOT_DOMAIN=localhost:3000 npm run dev
```

Abrir `http://localhost:3000/` y `http://localhost:3000/en`. La landing no requiere una BD en marcha;
las variables ficticias solo satisfacen la configuración compartida. El sitio demo enlazado es
`http://demo.localhost:3000/es` o `/en`: para cargar sus datos sí requiere el stack local con seed,
según `README.md`. No usar estos placeholders para probar el login o el dashboard.

Comprobar: un único h1, idioma correcto, CTA con número aprobado y mensaje prellenado, enlace demo,
FAQ expandibles con teclado, sin scroll horizontal a 320/375 px. Antes del merge el dueño debe
reemplazar todos los `TODO(owner)` de `config/marketing-content.ts` y revisar ambos idiomas.
El número actual `51000000000` es falso; no permite una conversación de venta real.

## Lighthouse móvil

`lighthouse.json` registra tres mediciones por idioma contra `next build` + `next start`, con
Lighthouse 13.6.0, emulación móvil y throttling simulado por defecto. Sin extensiones.
Resultado: **100 rendimiento / 100 accesibilidad / 100 SEO** en las seis mediciones (tres por idioma).
Se incluyen todas las mediciones finales, sin descartar puntuaciones bajas.

Para repetir: detener dev, ejecutar el mismo prefijo de variables del comando anterior con
`npm run build` y después con `npm run start`; en otra terminal:

```sh
npx --yes lighthouse@13.6.0 http://localhost:3000/ --form-factor=mobile --only-categories=performance,accessibility,seo --output=json --output-path=/tmp/sd704-es.json --chrome-flags="--headless=new --no-sandbox --disable-gpu --disable-extensions"
npx --yes lighthouse@13.6.0 http://localhost:3000/en --form-factor=mobile --only-categories=performance,accessibility,seo --output=json --output-path=/tmp/sd704-en.json --chrome-flags="--headless=new --no-sandbox --disable-gpu --disable-extensions"
```

Se tomó la configuración móvil del script existente `scripts/lighthouse-mobile.mjs`; no se ejecutó
ese gate de tenants porque requiere Supabase con seed y no evalúa la landing de plataforma.
Lighthouse se descargó temporalmente con npx y Playwright se instaló solo en `/tmp` para la
verificación de navegador; no se añadieron dependencias al proyecto.

Comprobaciones de navegador realizadas en es/en: enlaces canónicos y de idioma, destino demo,
mensaje WhatsApp codificado, `html lang`, salto al main con Tab/Enter, FAQ nativa, ausencia de errores
JS y de overflow en 320/375/1440 px. Cambiar temporalmente `--primary` y `--accent` en `.marketing`
recoloreó CTA y paneles; se verificaron los colores calculados y se recargó sin persistir el cambio.
Revisión visual de capturas móvil y escritorio, además de los audits automáticos de accesibilidad.

La imagen Open Graph se regenera con `node scripts/generate-marketing-og.mjs` tras cambiar la paleta.
No hay migraciones ni variables nuevas. No se implementa tracking del CTA: seguimiento pendiente
con diseño contra abuso, en relación con SD-409. Este PR **no debe mergearse** sin contenido aprobado.
