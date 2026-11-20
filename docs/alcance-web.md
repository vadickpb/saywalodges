# Que la web llegue a más personas (SD-1125)

Guía práctica para el dueño de Saywa Lodges (sirve igual para cada instalación). Primero lo técnico que ya está hecho; después,
en orden de impacto, lo que haces tú: casi todo es gratis y no depende de WhatsApp/Meta.

## Ya resuelto en el código
- **`robots.txt` y `sitemap.xml` en el dominio propio.** Antes respondían 404 en `www.saywalodges.com` (el enrutado solo los servía en
  los hosts de la plataforma): Google no tenía mapa del sitio. Ahora el sitemap lista la portada y cada villa en es/en con `hreflang`.
- **Descripción corta por villa** (≤ 158 caracteres) para que Google la muestre entera; el texto completo sigue en la página.
- `robots.txt` deja fuera las páginas privadas con token (estado de reserva, checkout, guía).
- Ya existían: título y descripción por idioma, Open Graph para compartir (foto grande en WhatsApp/Facebook), `canonical`,
  `hreflang` y datos estructurados `LodgingBusiness` (dirección, coordenadas, teléfono, servicios).

## Lo que haces tú, en orden de impacto

### 1. Google Search Console (30 min, gratis) — que Google indexe la web
1. <https://search.google.com/search-console> → **Agregar propiedad** → tipo **Dominio** → `saywalodges.com`.
2. Copia el registro **TXT** que te da y añádelo en el DNS del dominio (donde lo compraste o en Vercel → Domains si el DNS está allí).
   Espera a que diga «Verificado».
3. **Sitemaps** → escribe `https://www.saywalodges.com/sitemap.xml` → **Enviar**. Debe quedar «Correcto» con 8 URLs.
4. **Inspección de URLs** → pega `https://www.saywalodges.com/es` → **Solicitar indexación**. Repite con `/en`.
5. Revisa cada semana **Rendimiento**: qué búsquedas te muestran y cuántos clics recibes.

### 2. Redirección permanente del dominio (2 min)
Hoy `saywalodges.com` redirige a `www` con **307 (temporal)**. Vercel → proyecto → **Settings → Domains** → en `saywalodges.com`
elige **Redirect to `www.saywalodges.com`** con **308 Permanent**. Comprobar: `curl -sI https://saywalodges.com/es` muestra `308`.

### 3. Google Business Profile (1 h + verificación) — aparecer en Google Maps
Es la fuente más grande de reservas directas para alojamientos pequeños.
1. <https://business.google.com> → crea o reclama **Saywa Lodges**, categoría **Lodge** u **Hotel/Alojamiento vacacional**.
2. Misma dirección y teléfono que la web (deben coincidir exactamente con los datos estructurados).
3. **Sitio web**: `https://www.saywalodges.com/es`. Sube 15–30 fotos reales (fachada, piscina, cada villa, vistas).
4. Servicios, horarios de check-in/out y descripción con las palabras que la gente busca: «Urubamba», «Valle Sagrado», «piscina privada», «casa para grupos».
5. Verificación: Google envía un código (postal, llamada o video). Sin verificar no aparece en Maps.
6. **Reseñas**: después de cada estadía pide una reseña con el enlace corto que te da el perfil («Pedir reseñas»). Las reseñas
   son lo que más mueve el ranking en Maps. (Mejora futura: que el mensaje post-estadía incluya ese enlace, SD-1204.)

### 4. Enlazar la web desde donde ya te encuentran
- **Instagram/Facebook/TikTok**: enlace de la bio a `https://www.saywalodges.com/es`. Al compartir el enlace, la vista previa usa la
  foto de la portada.
- **Airbnb**: sus reglas no permiten poner enlaces externos en el anuncio ni en los mensajes antes de reservar. No lo arriesgues.
  Sí puedes usar la web con huéspedes que ya se alojaron (ficha de huésped, SD-601) para que la próxima vez reserven directo.
- **Directorios gratuitos**: TripAdvisor (propiedad), Booking (si lo usas), Bing Places (importa desde Google Business Profile),
  y directorios de turismo de Cusco/Urubamba. Mismo nombre, dirección y teléfono en todos.

### 5. Saber de dónde llegan las reservas
- Usa enlaces distintos por canal para medir (p. ej. `https://www.saywalodges.com/es?utm_source=instagram`). El panel todavía no
  muestra el origen de cada reserva: lo hace **SD-1201** (enlaces con seguimiento y atribución). Mientras tanto, Search Console y
  las estadísticas de Vercel (Analytics) muestran visitas.

## Mejoras de código propuestas (siguientes tickets)
| Ticket | Qué | Por qué |
|---|---|---|
| SD-1201 | Enlaces con seguimiento y origen de cada reserva | Saber qué canal trae reservas y dónde invertir |
| SD-1204 | Mensaje post-estadía con enlace a reseña de Google | Más reseñas = más visibilidad en Maps |
| SD-1112 | Páginas por intención de búsqueda («casa con piscina en Urubamba», «alojamiento para grupos en el Valle Sagrado») | Aparecer en búsquedas concretas, no solo por el nombre |
| — | URLs de villas con nombre (`/alojamientos/villa-i`) en vez de un id | Mejor lectura en Google y al compartir; requiere redirecciones desde las actuales |
| SD-1105 | Páginas legales y libro de reclamaciones virtual | Obligatorio para vender en línea en Perú y da confianza |
