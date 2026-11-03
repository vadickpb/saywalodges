#!/usr/bin/env node
// `npm run local:booking` — creates a test booking in YOUR LOCAL database, through the same public functions the website uses
// (quote -> create_booking_from_quote -> voucher upload -> submit_payment_voucher), so you can try the owner screens.
//
//   npm run local:booking                      booking with a payment voucher waiting for the owner's review
//   npm run local:booking -- --sin-comprobante booking waiting for payment (try the voucher upload as the guest)
//
// Local only: it refuses to run against anything but the local Supabase stack.
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { SUPABASE_CLI, isLocalUrl, parseStatusEnv } from "./lib/local-env.mjs";

const withVoucher = !process.argv.includes("--sin-comprobante");
const die = (m) => {
  console.error(`\n✖ ${m}\n`);
  process.exit(1);
};

const st = spawnSync("npx", ["--yes", SUPABASE_CLI, "status", "-o", "env"], { encoding: "utf8" });
const keys = st.status === 0 ? parseStatusEnv(st.stdout) : null;
if (!keys) die("Supabase local no está levantado. Ejecuta `npm run local -- --no-dev` primero.");
if (!isLocalUrl(keys.apiUrl)) die("Solo funciona contra la base local.");
const { apiUrl: api, anonKey, serviceRoleKey } = keys;

async function call(path, { method = "GET", key = serviceRoleKey, body, headers = {}, raw = false } = {}) {
  const res = await fetch(`${api}${path}`, {
    method, headers: { apikey: key, authorization: `Bearer ${key}`, ...(raw ? {} : { "content-type": "application/json" }), ...headers },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { ok: res.ok, status: res.status, json };
}

// The sample lodging of the seed (subdomain saywa-lodges): its property, an active unit and its currency.
const prop = (await call("/rest/v1/properties?subdomain=eq.saywa-lodges&select=id,org_id,currency,subdomain&limit=1")).json?.[0];
if (!prop) die("No encuentro el alojamiento de ejemplo. Ejecuta `npm run local -- --reset --no-dev` para cargar los datos de ejemplo.");
const unit = (await call(`/rest/v1/units?property_id=eq.${prop.id}&active=eq.true&select=id,name&order=created_at&limit=1`)).json?.[0];
if (!unit) die("El alojamiento de ejemplo no tiene unidades activas.");

// A payment account to pay to, so the guest page has something to show (only if none is active in this currency).
const accounts = (await call(`/rest/v1/property_payment_accounts?property_id=eq.${prop.id}&active=eq.true&currency=eq.${prop.currency}&select=id&limit=1`)).json ?? [];
if (accounts.length === 0) {
  await call("/rest/v1/property_payment_accounts", { method: "POST", body: { org_id: prop.org_id, property_id: prop.id, kind: "yape", holder_name: "Titular de Prueba", phone: "51900000001", currency: prop.currency, instructions: "Cuenta de ejemplo (solo local)" }, headers: { prefer: "return=minimal" } });
}

const GUESTS = [["María Fernández", "51987654321"], ["Carlos Quispe", "51976543210"], ["Ana Torres", "51965432109"], ["Luis Huamán", "51954321098"]];
const [guestName, guestPhone] = GUESTS[Math.floor(Math.random() * GUESTS.length)];
const stamp = Date.now().toString(36);
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

// A quote on free dates (try a few windows: the database refuses occupied dates).
let booking = null;
for (let attempt = 0; attempt < 8 && !booking; attempt++) {
  const offset = 25 + Math.floor(Math.random() * 300);
  const token = randomBytes(40).toString("hex");
  const quote = await call("/rest/v1/quotes", {
    method: "POST", headers: { prefer: "return=minimal" },
    body: { org_id: prop.org_id, property_id: prop.id, unit_id: unit.id, token, check_in: day(offset), check_out: day(offset + 2), guests: 2, currency: prop.currency, total_cents: 36000, deposit_cents: 18000, expires_at: new Date(Date.now() + 2 * 86_400_000).toISOString() },
  });
  if (!quote.ok) die(`No pude crear la cotización de prueba (HTTP ${quote.status}).`);
  const r = await call("/rest/v1/rpc/create_booking_from_quote", { key: anonKey, method: "POST", body: { p_token: token, p_guest_name: guestName, p_guest_email: `${guestName.split(" ")[0].toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")}.${stamp}@example.com`, p_guest_phone: guestPhone } });
  if (r.ok) booking = { ...r.json, checkIn: day(offset) };
  else if (r.json?.code !== "23P01") die(`No pude crear la reserva (HTTP ${r.status}).`);
}
if (!booking) die("No encontré fechas libres. Prueba de nuevo.");

if (withVoucher) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, sum]); };
  const W = 420, H = 560;
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = [255, 255, 255];
    if (y < 70) c = [106, 27, 154];
    else if (y > 120 && y < 140 && x > 60 && x < 360) c = [40, 40, 40];
    else if (y > 190 && y % 38 < 9 && x > 50 && x < (Math.floor(y / 38) % 2 ? 370 : 300)) c = [190, 190, 190];
    const o = y * (W * 3 + 1) + 1 + x * 3;
    raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);

  const path = `${prop.org_id}/${booking.public_token}/${randomUUID()}.png`;
  const up = await call(`/storage/v1/object/payment-vouchers/${path}`, { key: anonKey, method: "POST", raw: true, body: png, headers: { "content-type": "image/png" } });
  if (!up.ok) die(`No pude subir el comprobante (HTTP ${up.status}).`);
  const sub = await call("/rest/v1/rpc/submit_payment_voucher", { key: anonKey, method: "POST", body: { p_host: prop.subdomain, p_token: booking.public_token, p_voucher_path: path, p_method: "yape", p_reference: `Op ${Math.floor(1000000 + Math.random() * 8999999)}` } });
  if (!sub.ok) die(`No pude registrar el comprobante (HTTP ${sub.status}).`);
}

const id = (await call(`/rest/v1/bookings?public_token=eq.${booking.public_token}&select=id&limit=1`)).json?.[0]?.id;
console.log(`\n✔ Reserva de prueba creada para ${guestName} (${booking.checkIn}, 2 noches, adelanto ${(18000 / 100).toFixed(2)} ${prop.currency})`);
console.log(withVoucher ? "   Estado: con comprobante esperando tu revisión" : "   Estado: esperando el pago (sube el comprobante como huésped)");
console.log(`\n   Panel (lista) :  http://app.localhost:3000/app/bookings${withVoucher ? "?estado=needs_review" : ""}`);
if (id) console.log(`   Detalle       :  http://app.localhost:3000/app/bookings/${id}`);
console.log(`   Vista huésped :  http://${prop.subdomain}.localhost:3000/es/reserva/${booking.public_token}\n`);
