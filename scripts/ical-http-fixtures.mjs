// Test-process preload only. Production code has no network bypass flags.
// Run solely via test-ical-http.mjs; HTTPS is replaced in this process, and any
// unexpected destination fails closed. DNS and HTTPS boundary unit tests remain
// responsible for real request options, pinning, redirect and address validation.
import https from "node:https";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { readFileSync } from "node:fs";
if (process.env.SUPABASE_URL !== "http://127.0.0.1:54321")
  throw Error("Fixtures require local Supabase");
dns.lookup = async (host) => {
  if (!["www.airbnb.com", "ical.booking.com"].includes(host))
    throw Error("Unexpected fixture DNS request");
  return [{ address: "8.8.8.8", family: 4 }];
};
https.request = (url, options, callback) => {
  if (
    !["www.airbnb.com", "ical.booking.com"].includes(url.hostname) ||
    !url.pathname.startsWith("/sd305-fixture/")
  )
    throw Error("Unexpected fixture HTTPS request");
  const req = new EventEmitter();
  req.end = () =>
    queueMicrotask(() => {
      const res = new PassThrough();
      res.statusCode = 200;
      res.headers = {};
      let body = readFileSync(
        new URL(
          `../lib/ical/fixtures/${url.hostname === "www.airbnb.com" ? "airbnb" : "booking"}.ics`,
          import.meta.url,
        ),
        "utf8",
      );
      if (url.pathname.endsWith("short.ics"))
        body =
          body.split("BEGIN:VEVENT").slice(0, 2).join("BEGIN:VEVENT") +
          "END:VCALENDAR\r\n";
      if (url.pathname.endsWith("malformed.ics"))
        body = "<html>secret upstream error</html>";
      if (url.pathname.endsWith("redirect.ics")) {
        res.statusCode = 302;
        res.headers.location = "https://127.0.0.1/private";
      }
      callback(res);
      res.end(body);
    });
  return req;
};
syncBuiltinESMExports();
