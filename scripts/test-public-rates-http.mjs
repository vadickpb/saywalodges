// SD-208 HTTP smoke for the data-driven public Rates section. Read-only: it never writes
// to the database. Run against the LOCAL Supabase stack after `supabase db reset` (seed.sql)
// and a `next build` made with the local stack env (see .github/workflows/ci.yml, job `db`).
// Owns its app process on port 3208 and proves each tenant host renders ITS OWN texts,
// currency and seeded prices, with nothing from the other tenant.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

for (const file of [".env", ".env.local", ".env.production", ".env.production.local"])
  assert.ok(!existsSync(file), `Must not load ${file}`);
const status = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8" }));
assert.equal(status.API_URL, "http://127.0.0.1:54321", "Only local Supabase is allowed");

const PORT = 3208;
const ROOT = `localhost:${PORT}`;

// Civil date in Lima, independent of this machine's timezone. The page drops seasons that
// already ended, so the expectations below apply the same rule instead of assuming a date.
const todayLima = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const upcoming = (seasons) =>
  seasons.filter((s) => s.end > todayLima).sort((a, b) => a.start.localeCompare(b.start));

// Mirrors supabase/seed.sql (SD-205). Prices in cents, shown as whole units.
const holidays = [
  ["2027-01-01", "Año Nuevo"], ["2027-03-25", "Jueves Santo"], ["2027-03-26", "Viernes Santo"],
  ["2027-05-01", "Día del Trabajo"], ["2027-06-07", "Batalla de Arica y Día de la Bandera"],
  ["2027-06-29", "San Pedro y San Pablo"], ["2027-07-23", "Día de la Fuerza Aérea del Perú"],
  ["2027-07-28", "Fiestas Patrias — 28 de julio"], ["2027-07-29", "Fiestas Patrias — 29 de julio"],
  ["2027-08-06", "Batalla de Junín"], ["2027-08-30", "Santa Rosa de Lima"], ["2027-10-08", "Combate de Angamos"],
  ["2027-11-01", "Todos los Santos"], ["2027-12-08", "Inmaculada Concepción"], ["2027-12-09", "Batalla de Ayacucho"],
  ["2027-12-25", "Navidad"],
].map(([start, label]) => {
  const end = new Date(Date.parse(`${start}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return { start, end, title: `Feriado nacional 2027: ${label}`, price: "US$ 500" };
});
const tenants = {
  saywa: {
    host: "saywa-lodges.localhost",
    currencyMark: "US$",
    other: "demo",
    base: "US$ 220",
    seasons: upcoming([
      { start: "2027-06-01", end: "2027-10-01", title: "Temporada alta (ejemplo local 2027)", price: "US$ 300" },
      ...holidays,
    ]),
    text: {
      es: { headline: "Casa de campo privada en Urubamba", tagline: "con piscina temperada, hidromasaje y vistas a montañas" },
      en: { headline: "Private country house in Urubamba", tagline: "with heated pool, hot tub & mountain views" },
    },
  },
  demo: {
    host: "demo.localhost",
    currencyMark: "S/",
    other: "saywa",
    base: "S/ 100", // lowest of nightly 100 and weekend 120
    seasons: upcoming([{ start: "2027-07-28", end: "2027-07-30", title: "Feriado demo (ejemplo ficticio)", price: "S/ 150" }]),
    text: {
      es: { headline: "Un alojamiento demo de Saywa Direct", tagline: "Contenido de ejemplo para previsualizar la plantilla" },
      en: { headline: "A demo lodge for Saywa Direct", tagline: "Sample content to preview the site template" },
    },
  },
};
const labels = { es: { from: "desde", base: "Tarifa general", perNight: "por noche" }, en: { from: "from", base: "Standard rate", perNight: "per night" } };

// React escapes these five characters in text nodes.
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY, SUPABASE_URL: status.API_URL, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY, ROOT_DOMAIN: ROOT },
  stdio: ["ignore", "pipe", "pipe"],
});
let appOutput = "";
app.stdout.on("data", (b) => { appOutput += b; });
app.stderr.on("data", (b) => { appOutput += b; });

const get = (host, path) => new Promise((resolve, reject) => {
  const req = httpRequest({ host: "127.0.0.1", port: PORT, path, headers: { Host: `${host}:${PORT}` }, signal: AbortSignal.timeout(15000) }, (res) => {
    let body = ""; res.setEncoding("utf8"); res.on("data", (c) => (body += c)); res.on("end", () => resolve({ status: res.statusCode, body }));
  });
  req.on("error", reject); req.end();
});

// Cards of <section id="rates">: one <li> each, <p> texts = title, [period], price, per-night.
function ratesSection(html) {
  const start = html.indexOf('<section id="rates"');
  const end = html.indexOf('id="availability"', start);
  assert.ok(start >= 0 && end > start, "rates section with availability CTA is rendered");
  const section = html.slice(start, end);
  const cards = [...section.matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map((li) => [...li[1].matchAll(/<p[^>]*>([^<]*)<\/p>/g)].map((p) => p[1]));
  return { section, cards };
}
const ok = (name) => console.log(`PASS ${name}`);
const pages = {};

try {
  for (let i = 0; i < 60; i++) {
    try { if ((await get("saywa-lodges.localhost", "/")).status < 500) break; } catch {}
    await sleep(500);
    assert.ok(i < 59, `App did not start:\n${appOutput}`);
  }

  for (const [key, tenant] of Object.entries(tenants)) {
    for (const lang of ["es", "en"]) {
      const l = labels[lang];
      const res = await get(tenant.host, `/${lang}`);
      assert.equal(res.status, 200, `${key}/${lang} status`);
      pages[`${key}/${lang}`] = res.body;

      // Tenant texts from properties.content.
      assert.ok(res.body.includes(esc(tenant.text[lang].headline)), `${key}/${lang} headline`);
      assert.ok(res.body.includes(esc(tenant.text[lang].tagline)), `${key}/${lang} tagline`);
      assert.ok(!res.body.includes(esc(tenants[tenant.other].text[lang].headline)), `${key}/${lang} shows the other tenant headline`);

      // Rate cards: base first, then upcoming seasons by start date, all from the tenant's rows.
      const { cards } = ratesSection(res.body);
      assert.equal(cards.length, 1 + tenant.seasons.length, `${key}/${lang} card count`);
      const [base, ...seasonCards] = cards;
      assert.deepEqual(base, [l.base, `${l.from} ${tenant.base}`, l.perNight], `${key}/${lang} base card`);
      seasonCards.forEach((card, i) => {
        const season = tenant.seasons[i];
        assert.equal(card.length, 4, `${key}/${lang} season card has a period`);
        const [title, period, price, perNight] = card;
        assert.equal(title, esc(season.title));
        assert.match(period, /2027/);
        assert.equal(price, `${l.from} ${season.price}`);
        assert.equal(perNight, l.perNight);
      });
      assert.ok(res.body.includes('href="#rates"'), `${key}/${lang} nav links to rates`);
      ok(`${key}/${lang}: own headline, ${tenant.currencyMark} currency, base ${tenant.base} + ${tenant.seasons.length} seasonal cards`);
    }
  }

  // No price crossing: confine the check to the rates section (cards + note) of each page.
  for (const lang of ["es", "en"]) {
    const saywa = ratesSection(pages[`saywa/${lang}`]).section;
    const demo = ratesSection(pages[`demo/${lang}`]).section;
    assert.ok(!/S\/ \d/.test(saywa), `saywa/${lang} rates carry a PEN price`);
    assert.ok(!saywa.includes("Feriado demo"), `saywa/${lang} rates carry a demo season`);
    assert.ok(!demo.includes("US$"), `demo/${lang} rates carry a USD price`);
    assert.ok(!/Temporada alta|Feriado nacional/.test(demo), `demo/${lang} rates carry a Saywa season`);
    for (const saywaOnly of ["220", "300", "500"]) assert.ok(!demo.includes(saywaOnly), `demo/${lang} shows Saywa amount ${saywaOnly}`);
    for (const demoOnly of ["S/ 100", "S/ 150"]) assert.ok(!saywa.includes(demoOnly), `saywa/${lang} shows demo amount ${demoOnly}`);
  }
  ok("no price, currency or season crosses between saywa-lodges and demo");

  console.log("ALL PASS");
} catch (error) {
  console.error(appOutput.slice(-3000));
  throw error;
} finally {
  app.kill("SIGTERM");
  await new Promise((resolve) => (app.exitCode !== null ? resolve() : app.once("exit", resolve)));
}
