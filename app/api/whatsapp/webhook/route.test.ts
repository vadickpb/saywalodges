import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const recordWhatsappStatus = vi.fn();
vi.mock("@/lib/dal/whatsapp", () => ({ recordWhatsappStatus: (e: unknown) => recordWhatsappStatus(e) }));
import { GET, POST } from "./route";

const APP_SECRET = "a".repeat(32);
const VERIFY = "v".repeat(24);
const sign = (body: string, secret = APP_SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
const payload = (statuses: unknown[]) => JSON.stringify({ entry: [{ changes: [{ value: { statuses } }] }] });
const post = (body: string, signature: string | null) =>
  new Request("http://app.localhost:3000/api/whatsapp/webhook", { method: "POST", body, headers: signature ? { "x-hub-signature-256": signature } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WHATSAPP_APP_SECRET", APP_SECRET);
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", VERIFY);
});

describe("GET handshake", () => {
  const url = (q: string) => new Request(`http://app.localhost:3000/api/whatsapp/webhook?${q}`);
  it("echoes the challenge as plain text for the right token", async () => {
    const res = await GET(url(`hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=12345`));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("12345");
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
  it("answers a bare 403 for a wrong token, and when unconfigured", async () => {
    expect((await GET(url("hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1"))).status).toBe(403);
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "");
    const res = await GET(url(`hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=1`));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("");
  });
});

describe("POST", () => {
  const statuses = [{ id: "wamid.A", status: "delivered", timestamp: "1700000000" }];

  it("rejects an invalid, missing or foreign signature with a bare 401 and touches nothing", async () => {
    const body = payload(statuses);
    for (const sig of [null, "sha256=" + "0".repeat(64), sign(body, "b".repeat(32)), "garbage"]) {
      const res = await POST(post(body, sig));
      expect(res.status).toBe(401);
      expect(await res.text()).toBe("");
    }
    expect(recordWhatsappStatus).not.toHaveBeenCalled();
  });
  it("a body altered after signing is rejected", async () => {
    const signed = sign(payload(statuses));
    expect((await POST(post(payload([{ id: "wamid.EVIL", status: "read" }]), signed))).status).toBe(401);
    expect(recordWhatsappStatus).not.toHaveBeenCalled();
  });
  it("refuses everything when the webhook is not configured", async () => {
    vi.stubEnv("WHATSAPP_APP_SECRET", "");
    const body = payload(statuses);
    expect((await POST(post(body, sign(body)))).status).toBe(401);
    expect(recordWhatsappStatus).not.toHaveBeenCalled();
  });
  it("records each status event of a signed payload and answers 200", async () => {
    recordWhatsappStatus.mockResolvedValue("updated");
    const body = payload([...statuses, { id: "wamid.B", status: "read" }, { id: "wamid.C", status: "deleted" }]);
    const res = await POST(post(body, sign(body)));
    expect(res.status).toBe(200);
    expect(recordWhatsappStatus).toHaveBeenCalledTimes(2);
    expect(recordWhatsappStatus).toHaveBeenCalledWith(expect.objectContaining({ wamid: "wamid.A", status: "delivered" }));
  });
  it("a duplicate event is acknowledged with 200 and has no effect (the RPC answers 'ignored')", async () => {
    recordWhatsappStatus.mockResolvedValue("ignored");
    const body = payload(statuses);
    expect((await POST(post(body, sign(body)))).status).toBe(200);
    expect((await POST(post(body, sign(body)))).status).toBe(200);
    expect(recordWhatsappStatus).toHaveBeenCalledTimes(2);
  });
  it("answers 200 and stores nothing for inbound guest messages", async () => {
    const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: "51999999999", text: { body: "hola" } }] } }] }] });
    expect((await POST(post(body, sign(body)))).status).toBe(200);
    expect(recordWhatsappStatus).not.toHaveBeenCalled();
  });
  it("answers 500 when the database fails, so that Meta retries (events are idempotent)", async () => {
    recordWhatsappStatus.mockRejectedValue(new Error("db down"));
    const body = payload(statuses);
    const res = await POST(post(body, sign(body)));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("");
  });
  it("answers 400 for a signed body that is not JSON or not the expected envelope", async () => {
    expect((await POST(post("not json", sign("not json")))).status).toBe(400);
    const bad = JSON.stringify({ entry: "x" });
    expect((await POST(post(bad, sign(bad)))).status).toBe(400);
  });
  it("answers 413 for an oversized declared body without reading it", async () => {
    const req = new Request("http://app.localhost:3000/api/whatsapp/webhook", { method: "POST", body: "{}", headers: { "content-length": String(300 * 1024) } });
    expect((await POST(req)).status).toBe(413);
  });
});
