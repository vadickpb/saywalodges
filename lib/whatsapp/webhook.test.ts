import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseStatusEvents, safeEqual, verifyHandshake, verifySignature } from "./webhook";

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
    expect(parseStatusEvents({ entry: [{ changes: [{ value: { statuses: [{ status: "sent" }] } }] }] })).toBeNull();
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
