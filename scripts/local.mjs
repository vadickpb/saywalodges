#!/usr/bin/env node
// `npm run local` — one command to get the app running on your machine.
//
//   npm run local                 starts Supabase (Docker), fills .env.local and runs the dev server
//   npm run local -- --reset      also rebuilds the local database (migrations + sample data). ERASES local data.
//   npm run local -- --no-dev     prepares everything but does not start the dev server
//
// It only ever talks to the LOCAL stack. If your .env.local points to a hosted Supabase project it stops and says so.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import { SUPABASE_CLI, localEnvVars, mergeEnvFile, parseStatusEnv } from "./lib/local-env.mjs";

const args = new Set(process.argv.slice(2));
const reset = args.has("--reset");
const noDev = args.has("--no-dev");
const say = (m = "") => console.log(m);
const die = (m) => {
  console.error(`\n✖ ${m}\n`);
  process.exit(1);
};
const cli = (...a) => ["--yes", SUPABASE_CLI, ...a];
const run = (a, inherit = true) => spawnSync("npx", cli(...a), { stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"], encoding: "utf8" });

// 1. Docker
try {
  execFileSync("docker", ["info"], { stdio: "ignore" });
} catch {
  die("Docker no responde. Abre Docker Desktop, espera a que diga «running» y vuelve a ejecutar `npm run local`.");
}

// 2. Supabase (local stack)
const readStatus = () => {
  const r = run(["status", "-o", "env"], false);
  return r.status === 0 ? parseStatusEnv(r.stdout) : null;
};
let keys = readStatus();
if (!keys) {
  say("▶ Levantando Supabase local (la primera vez tarda unos minutos)…");
  if (run(["start"]).status !== 0) die("No se pudo iniciar Supabase. Revisa que Docker tenga espacio y memoria, y vuelve a intentarlo.");
  keys = readStatus();
  if (!keys) die("Supabase arrancó pero no pude leer sus claves. Ejecuta `npx --yes " + SUPABASE_CLI + " status` para ver el estado.");
}
if (reset) {
  say("▶ Reiniciando la base local (migraciones + datos de ejemplo). Se borran los datos locales.");
  if (run(["db", "reset"]).status !== 0) die("`db reset` falló. Mira el error de arriba.");
}

// 3. .env.local (only the four Supabase variables; everything else is kept)
const file = ".env.local";
const before = existsSync(file) ? readFileSync(file, "utf8") : "";
const merged = mergeEnvFile(before, localEnvVars(keys));
if (merged.conflict) die(`${file}: ${merged.conflict}`);
if (merged.changed) {
  writeFileSync(file, merged.content, { mode: 0o600 });
  say(`▶ ${file} actualizado con las claves de tu Supabase local.`);
} else {
  say(`▶ ${file} ya estaba al día.`);
}

say("\n✔ Entorno local listo");
say("   Sitio público :  http://saywa-lodges.localhost:3000/es");
say("   Panel         :  http://app.localhost:3000/login   (owner@saywalodges.com / devpassword123)");
say("   Staff         :  staff@saywalodges.test / devpassword123");
say("   Reserva de prueba:  npm run local:booking   (añade --sin-comprobante para probar la subida del comprobante)\n");
if (noDev) process.exit(0);

// 4. Dev server
const busy = await new Promise((resolve) => {
  const s = net.createServer().once("error", () => resolve(true)).once("listening", () => s.close(() => resolve(false)));
  s.listen(3000);
});
if (busy) die("El puerto 3000 ya está en uso (¿otro `npm run dev` abierto?). Ciérralo con Ctrl+C en su terminal y vuelve a ejecutar `npm run local`, o usa `npm run local -- --no-dev`.");
say("▶ Iniciando el servidor de desarrollo (Ctrl+C para detenerlo)…\n");
const dev = spawn("npm", ["run", "dev"], { stdio: "inherit" });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => dev.kill(sig));
dev.on("exit", (code) => process.exit(code ?? 0));
