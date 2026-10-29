// SD-305 HTTP + real local Postgres integration. Build first with local env.
// Owns its app process on port 3000 and cleans only rows it created.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { createServerClient } from "@supabase/ssr";
import { createRequire } from "node:module";
const { encodeReply } = createRequire(import.meta.url)(
  "next/dist/compiled/react-server-dom-webpack/client.node",
);
for (const file of [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
])
  assert.ok(!existsSync(file), `Must not load ${file}`);
const status = JSON.parse(
  execFileSync("npx", ["supabase", "status", "-o", "json"], {
    encoding: "utf8",
  }),
);
assert.equal(status.API_URL, "http://127.0.0.1:54321");
const org = "bf88f504-051f-4fdc-ab73-4fa12d715817";
const unit = "ee204001-0000-4000-8000-000000000001";
const booking = randomUUID();
const base = "http://localhost:3000";
const page = `${base}/app/calendar/feeds`;
const manifest = JSON.parse(
  readFileSync(".next/server/server-reference-manifest.json", "utf8"),
);
const actionId = (name) => {
  const match = Object.entries(manifest.node).find(
    ([, a]) =>
      a.filename === "app/app/calendar/feeds/actions.ts" &&
      a.exportedName === name,
  );
  assert.ok(match, `Missing action ${name}`);
  return match[0];
};
const app = spawn(
  process.execPath,
  [
    "--import",
    "./scripts/ical-http-fixtures.mjs",
    "node_modules/next/dist/bin/next",
    "start",
    "-p",
    "3000",
  ],
  {
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
      SUPABASE_URL: status.API_URL,
      SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
      // Must match the request Host: the proxy intentionally denies dashboard
      // routes on tenant/custom hosts. PLATFORM_HOSTS is not a supported setting.
      ROOT_DOMAIN: new URL(base).host,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let appOutput = "";
app.stdout.on("data", (b) => {
  appOutput += b;
});
app.stderr.on("data", (b) => {
  appOutput += b;
});
async function session(email) {
  const cookies = new Map();
  const client = createServerClient(status.API_URL, status.ANON_KEY, {
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: (items) =>
        items.forEach(({ name, value }) => cookies.set(name, value)),
    },
  });
  assert.equal(
    (
      await client.auth.signInWithPassword({
        email,
        password: "devpassword123",
      })
    ).error,
    null,
  );
  sessions.push(client);
  return {
    client,
    cookie: () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
  };
}
async function action(name, fields, session) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  const body = await encodeReply(
    name === "saveImportUrlAction" ? [{ ok: false }, form] : [form],
  );
  const res = await fetch(page, {
    method: "POST",
    headers: {
      Origin: base,
      "Next-Action": actionId(name),
      ...(session ? { Cookie: session.cookie() } : {}),
    },
    body,
    redirect: "manual",
  });
  return { status: res.status, text: await res.text() };
}
const feeds = [];
const sql = (query) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_saywa-lodges",
      "psql",
      "-XqAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "supabase_admin",
      "-d",
      "postgres",
    ],
    { input: query, encoding: "utf8" },
  );
let owner;
const sessions = [];
try {
  for (let i = 0; ; i++) {
    try {
      if (
        (
          await fetch(`${base}/api/ical/invalid`, {
            signal: AbortSignal.timeout(1000),
          })
        ).status === 404
      )
        break;
    } catch {}
    if (i > 100 || app.exitCode !== null)
      throw Error(`App failed to start: ${appOutput}`);
    await sleep(100);
  }
  owner = await session("owner@saywalodges.com");
  const staff = await session("staff@saywalodges.test");
  const otherOwner = await session("owner@demo.saywadirect.test");
  // This direct reservation block is created only inside local Docker. SD-401's
  // bookings table is not part of this ticket; calendar_blocks is authoritative.
  sql(
    `insert into public.calendar_blocks(org_id,property_id,unit_id,period,source,booking_id) select org_id,property_id,id,'[2027-10-11,2027-10-15)','booking','${booking}' from public.units where id='${unit}';`,
  );
  for (const channel of ["airbnb", "booking"]) {
    const { data, error } = await owner.client
      .from("ical_feeds")
      .insert({ org_id: org, unit_id: unit, channel })
      .select("id")
      .single();
    assert.equal(error, null);
    feeds.push(data.id);
  }
  const [airbnb, bookingFeed] = feeds;
  const readBlocks = async (id) => {
    const { data, error } = await owner.client
      .from("calendar_blocks")
      .select("id,period")
      .eq("feed_id", id)
      .order("id");
    assert.equal(error, null);
    return data;
  };
  const anonymousPage = await fetch(page, { redirect: "manual" });
  assert.equal(
    anonymousPage.status,
    307,
    "Dashboard must reach auth: check ROOT_DOMAIN matches the request Host if this is 404",
  );
  // Node fetch can replace Host with the URL authority. Use raw HTTP to
  // exercise the actual tenant Host seen by proxy.ts.
  const tenantStatus = await new Promise((resolve, reject) => {
    const req = httpRequest(page, {
      headers: { Host: "tenant.localhost:3000", Cookie: owner.cookie() },
      signal: AbortSignal.timeout(5000),
    }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", reject);
    req.end();
  });
  assert.equal(tenantStatus, 404, "Dashboard must remain denied on tenant hosts");
  const ownerPage = await fetch(page, { headers: { Cookie: owner.cookie() } });
  const ownerHtml = await ownerPage.text();
  assert.equal(ownerPage.status, 200);
  assert.match(ownerHtml, /Calendarios para los canales/);
  const staffPage = await fetch(page, { headers: { Cookie: staff.cookie() } });
  assert.equal(staffPage.status, 404);
  assert.doesNotMatch(
    await staffPage.text(),
    /Enlace de importación del canal|Sincronizar ahora/,
  );
  const invalid = await action(
    "saveImportUrlAction",
    { id: airbnb, url: "https://127.0.0.1/private" },
    owner,
  );
  assert.match(invalid.text, /"ok":false/);
  assert.match(
    (
      await action(
        "saveImportUrlAction",
        {
          id: airbnb,
          url: "https://www.airbnb.com/sd305-fixture/airbnb.ics?secret=anonymous",
        },
        owner,
      )
    ).text,
    /"ok":true/,
  );
  assert.match(
    (await action("syncFeedAction", { id: airbnb }, staff)).text,
    /Solo el dueño/,
  );
  assert.match(
    (await action("syncFeedAction", { id: airbnb }, owner)).text,
    /"ok":true/,
  );
  const initial = await readBlocks(airbnb);
  assert.equal(initial.length, 2);
  assert.match(
    (await action("syncFeedAction", { id: airbnb }, owner)).text,
    /"ok":true/,
  );
  assert.deepEqual(await readBlocks(airbnb), initial);
  const dashboard = await fetch(page, { headers: { Cookie: owner.cookie() } });
  const html = await dashboard.text();
  assert.equal(dashboard.status, 200);
  assert.match(html, /reserva directa/);
  assert.match(html, /2027-10-11/);
  assert.match(html, /2027-10-15/);
  assert.match(html, /Última sincronización/);
  assert.doesNotMatch(html, /anonymous-stay|Phone Number|Anonymous guest/);
  // A real owner of org B cannot act on or read org A's known feed/conflict.
  assert.match((await action("syncFeedAction", { id: airbnb }, otherOwner)).text, /"ok":false/);
  assert.match((await action("saveImportUrlAction", { id: airbnb, url: "" }, otherOwner)).text, /"ok":false/);
  assert.match((await action("deleteFeedAction", { id: airbnb }, otherOwner)).text, /"ok":false/);
  for (const table of ["ical_feeds", "sync_conflicts", "calendar_blocks"]) {
    const { data, error } = await otherOwner.client.from(table).select("id").eq(table === "ical_feeds" ? "id" : "feed_id", airbnb);
    assert.equal(error, null);
    assert.deepEqual(data, []);
  }
  assert.deepEqual(await readBlocks(airbnb), initial);
  const otherPage = await fetch(page, { headers: { Cookie: otherOwner.cookie() } });
  assert.equal(otherPage.status, 200);
  assert.doesNotMatch(await otherPage.text(), /sd305-fixture|reserva directa/);
  console.log(
    "PASS cross-tenant HTTP actions and RLS reads denied with a real second owner session",
  );
  console.log(
    "PASS owner-only HTTP actions, private URL rejection, real parser, stable repeated sync and visible direct booking conflict",
  );
  assert.match(
    (
      await action(
        "saveImportUrlAction",
        {
          id: bookingFeed,
          url: "https://ical.booking.com/sd305-fixture/booking.ics",
        },
        owner,
      )
    ).text,
    /"ok":true/,
  );
  assert.match(
    (await action("syncFeedAction", { id: bookingFeed }, owner)).text,
    /"ok":true/,
  );
  const other = await readBlocks(bookingFeed);
  assert.equal(other.length, 3);
  await action(
    "saveImportUrlAction",
    { id: airbnb, url: "https://www.airbnb.com/sd305-fixture/short.ics" },
    owner,
  );
  assert.match(
    (await action("syncFeedAction", { id: airbnb }, owner)).text,
    /"ok":true/,
  );
  const short = await readBlocks(airbnb);
  assert.equal(short.length, 1);
  assert.deepEqual(await readBlocks(bookingFeed), other);
  assert.equal(
    (
      await owner.client
        .from("sync_conflicts")
        .select("id")
        .eq("feed_id", airbnb)
    ).data.length,
    0,
  );
  assert.equal(
    sql(
      `select count(*) from public.calendar_blocks where booking_id='${booking}';`,
    ).trim(),
    "1",
  );
  console.log(
    "PASS disappeared event/conflict removed; other feed and direct reservation preserved",
  );
  for (const [mode, code] of [
    ["malformed", "FORMAT"],
    ["redirect", "URL"],
  ]) {
    await action(
      "saveImportUrlAction",
      { id: airbnb, url: `https://www.airbnb.com/sd305-fixture/${mode}.ics` },
      owner,
    );
    assert.match(
      (await action("syncFeedAction", { id: airbnb }, owner)).text,
      /"ok":false/,
    );
    assert.deepEqual(await readBlocks(airbnb), short);
    const { data, error } = await owner.client
      .from("ical_feeds")
      .select("last_error")
      .eq("id", airbnb)
      .single();
    assert.equal(error, null);
    assert.equal(data.last_error, code);
  }
  const foreign = await action("syncFeedAction", { id: randomUUID() }, owner);
  assert.match(foreign.text, /No se pudo sincronizar/);
  assert.doesNotMatch(foreign.text, /42501|not allowed|secret upstream/);
  const anon = await action("syncFeedAction", { id: airbnb });
  assert.match(anon.text, /login|NEXT_REDIRECT/);
  assert.match((await action("deleteFeedAction", { id: bookingFeed }, owner)).text, /"ok":true/);
  assert.deepEqual(await readBlocks(bookingFeed), []);
  assert.deepEqual(await readBlocks(airbnb), short);
  assert.equal(sql(`select count(*) from public.calendar_blocks where booking_id='${booking}';`).trim(), "1");
  console.log("PASS HTTP feed deletion removes its imported blocks and preserves other feed/direct reservation");
  console.log(
    "PASS malformed snapshot and unsafe redirect preserve blocks, safe status errors, foreign ID and anonymous actions denied",
  );
} finally {
  if (owner) {
    for (const id of feeds)
      await owner.client.from("ical_feeds").delete().eq("id", id);

  }
  for (const client of sessions) await client.auth.signOut({ scope: "local" });
  sql(`delete from public.calendar_blocks where booking_id='${booking}';`);
  app.kill("SIGTERM");
  await new Promise((resolve) => {
    if (app.exitCode !== null) resolve();
    else app.once("exit", resolve);
  });
}
