import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { autoReplyText, isStopMessage, parseInboundMessages, parseStatusEvents, safeEqual, verifyHandshake, verifySignature } from "./webhook";

const SECRET = "s".repeat(32);
const sign = (body: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("verifySignature", () => {
  const body = '{"entry":[]}';
  it("accepts the right signature over the raw body", () => {
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
  });
  it("rejects a wrong secret, a changed body, a missing or malformed header", () => {
    expect(verifySignature(body, sign(body, "x".repeat(32)), SECRET)).toBe(false);
    expect(verifySignature(body + " ", sign(body), SECRET)).toBe(false);
    expect(verifySignature(body, null, SECRET)).toBe(false);
    for (const h of ["", "sha256=", "sha256=zz", sign(body).replace("sha256=", "sha1="), sign(body).slice(0, -2), `${sign(body)}00`]) {
      expect(verifySignature(body, h, SECRET)).toBe(false);
    }
  });
  it("signs the raw bytes: a body that is not valid UTF-8 still verifies", () => {
    const bytes = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]);
    const header = `sha256=${createHmac("sha256", SECRET).update(bytes).digest("hex")}`;
    expect(verifySignature(bytes, header, SECRET)).toBe(true);
    expect(verifySignature(Buffer.from([0x7b, 0xff, 0x7d]), header, SECRET)).toBe(false);
  });
  it("is case-insensitive on the hex digits only", () => {
    expect(verifySignature(body, sign(body).toUpperCase().replace("SHA256=", "sha256="), SECRET)).toBe(true);
  });
});

describe("verifyHandshake", () => {
  const params = (o: Record<string, string>) => new URLSearchParams(o);
  it("echoes a plain challenge for the right token", () => {
    expect(verifyHandshake(params({ "hub.mode": "subscribe", "hub.verify_token": "tok", "hub.challenge": "1158201444" }), "tok")).toBe("1158201444");
  });
  it("refuses a wrong token, wrong mode, missing challenge", () => {
    expect(verifyHandshake(params({ "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "1" }), "tok")).toBeNull();
    expect(verifyHandshake(params({ "hub.mode": "unsubscribe", "hub.verify_token": "tok", "hub.challenge": "1" }), "tok")).toBeNull();
    expect(verifyHandshake(params({ "hub.mode": "subscribe", "hub.verify_token": "tok" }), "tok")).toBeNull();
  });
  it("never reflects a challenge that is not a plain token (no markup, no spaces)", () => {
    expect(verifyHandshake(params({ "hub.mode": "subscribe", "hub.verify_token": "tok", "hub.challenge": "<script>alert(1)</script>" }), "tok")).toBeNull();
  });
});

const env = (statuses: unknown[]) => ({ object: "whatsapp_business_account", entry: [{ id: "1", changes: [{ field: "messages", value: { messaging_product: "whatsapp", statuses } }] }] });

describe("parseStatusEvents", () => {
  it("extracts delivery events with time and error code", () => {
    const events = parseStatusEvents(env([
      { id: "wamid.A", status: "delivered", timestamp: "1700000000", recipient_id: "519999" },
      { id: "wamid.B", status: "failed", timestamp: "1700000001", errors: [{ code: 131026, title: "x" }] },
    ]));
    expect(events).toEqual([
      { wamid: "wamid.A", status: "delivered", at: new Date(1700000000 * 1000), errorCode: null },
      { wamid: "wamid.B", status: "failed", at: new Date(1700000001 * 1000), errorCode: "131026" },
    ]);
  });
  it("never carries the recipient's number", () => {
    expect(JSON.stringify(parseStatusEvents(env([{ id: "wamid.A", status: "sent", recipient_id: "51999999999" }])))).not.toContain("51999999999");
  });
  it("ignores unknown statuses and inbound messages", () => {
    expect(parseStatusEvents(env([{ id: "wamid.A", status: "deleted" }]))).toEqual([]);
    expect(parseStatusEvents({ entry: [{ changes: [{ value: { messages: [{ from: "519", text: { body: "hola" } }] } }] }] })).toEqual([]);
  });
  it("drops a weird error code instead of storing it", () => {
    const [e] = parseStatusEvents(env([{ id: "wamid.A", status: "failed", errors: [{ code: "<b>drop</b>" }] }]))!;
    expect(e.errorCode).toBeNull();
  });
  it("returns null when the body is not the expected envelope", () => {
    expect(parseStatusEvents("nope")).toBeNull();
    expect(parseStatusEvents({ entry: "x" })).toBeNull();
  });
  it("skips a change it cannot read instead of failing the whole payload (no 400 retry storms)", () => {
    expect(parseStatusEvents({ entry: [{ changes: [{ field: "other", value: "text" }, { field: "x" }, { value: { statuses: [{ status: "sent" }] } }] }] })).toEqual([]);
    const events = parseStatusEvents({ entry: [{ changes: [{ value: 5 }, { value: { statuses: [{ id: "wamid.A", status: "read" }] } }] }] });
    expect(events).toEqual([{ wamid: "wamid.A", status: "read", at: null, errorCode: null }]);
  });
  it("an empty object is a valid envelope with no events", () => {
    expect(parseStatusEvents({})).toEqual([]);
  });
});

describe("safeEqual", () => {
  it("compares strings of any length", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("inbound messages (SD-1012)", () => {
  const wrap = (value: unknown) => ({ entry: [{ changes: [{ value }] }] });
  it("parses text and non-text messages and ignores status-only events", () => {
    const out = parseInboundMessages(wrap({
      contacts: [{ wa_id: "51999111222", profile: { name: " Ana " } }],
      messages: [
        { id: "w1", from: "51999111222", timestamp: "1700000000", type: "text", text: { body: "hola" } },
        { id: "w2", from: "51999333444", timestamp: "1700000001", type: "image" },
      ],
    }));
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ wamid: "w1", name: "Ana", body: "hola", type: "text" });
    expect(out[0].at.getTime()).toBe(1700000000_000);
    expect(out[1]).toMatchObject({ name: null, body: "", type: "image" });
    expect(parseInboundMessages(wrap({ statuses: [{ id: "s", status: "sent" }] }))).toEqual([]);
    expect(parseInboundMessages("nope")).toEqual([]);
  });
  it("skips malformed entries only", () => {
    const out = parseInboundMessages(wrap({ messages: [{ id: "", from: "1", timestamp: "x", type: "text" }, { id: "ok", from: "51999111222", timestamp: "1", type: "text", text: { body: "b" } }] }));
    expect(out.map((m) => m.wamid)).toEqual(["ok"]);
  });
  it.each(["STOP", " stop ", "Baja", "baja.", "NO MÁS", "unsubscribe", "Parar"])("%j is a stop request", (body) => expect(isStopMessage(body)).toBe(true));
  it.each(["no pares de mandarme fotos", "stop the car", "hola", "", "cancelar mi reserva por favor", "Cancelar", "para"])("%j is not", (body) => expect(isStopMessage(body)).toBe(false));
  it("the auto-reply carries the quoter link in both languages, and none without a public domain", () => {
    const text = autoReplyText("saywalodges.com");
    expect(text).toContain("https://saywalodges.com/es/cotizar");
    expect(text).toContain("https://saywalodges.com/en/cotizar");
    for (const bad of [undefined, "", "localhost", "evil.com/x y", "a b.com"]) expect(autoReplyText(bad)).toBeNull();
  });
});
