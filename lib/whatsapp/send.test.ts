import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { sendWhatsappTemplate, type SendTemplateInput, type WhatsappDeps } from "./send";

const input: SendTemplateInput = { orgId: "org-1", bookingId: "b-1", to: "51999999999", template: "booking_confirmed", language: "es", params: ["Ana", "12 nov"], optIn: true };
const live = { mode: "live", accessToken: "tok_secret_value", phoneNumberId: "123456789012345", apiVersion: "v21.0" } as const;
const mkDeps = (over: Partial<WhatsappDeps> = {}) => {
  const log = vi.fn();
  const record = vi.fn().mockResolvedValue(undefined);
  const fetchMock = vi.fn();
  return { log, record, fetchMock, deps: { config: live, log, record, fetch: fetchMock as unknown as typeof fetch, ...over } satisfies WhatsappDeps };
};
const jsonRes = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("simulation", () => {
  it("sends nothing to Meta, records the message, and says so", async () => {
    const { deps, fetchMock, record } = mkDeps({ config: { mode: "simulate" } });
    const res = await sendWhatsappTemplate(input, deps);
    expect(res).toMatchObject({ ok: true, simulated: true });
    expect(res.ok && res.id).toMatch(/^sim_/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org-1", bookingId: "b-1", template: "booking_confirmed", mode: "simulate", wamid: expect.stringMatching(/^sim_/) }));
  });
});

describe("disabled", () => {
  it("fails closed and never calls Meta", async () => {
    const { deps, fetchMock } = mkDeps({ config: { mode: "disabled", reason: "missing_credentials" } });
    expect(await sendWhatsappTemplate(input, deps)).toEqual({ ok: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("input validation", () => {
  it.each([
    ["phone with a plus", { to: "+51999999999" }],
    ["phone too short", { to: "12345" }],
    ["phone with text", { to: "51999abc999" }],
    ["template with capitals", { template: "BookingConfirmed" }],
    ["template with a slash", { template: "a/b" }],
    ["language free text", { language: "spanish" }],
    ["empty param", { params: [""] }],
    ["too many params", { params: Array.from({ length: 21 }, () => "x") }],
    ["no opt-in at runtime", { optIn: false as unknown as true }],
  ])("rejects %s before any network call", async (_label, patch) => {
    const { deps, fetchMock, record } = mkDeps();
    expect(await sendWhatsappTemplate({ ...input, ...patch }, deps)).toEqual({ ok: false, reason: "invalid_input" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
});

describe("live", () => {
  it("posts the template to the Graph API and records the wamid", async () => {
    const { deps, fetchMock, record } = mkDeps();
    fetchMock.mockResolvedValue(jsonRes(200, { messages: [{ id: "wamid.XYZ" }] }));
    expect(await sendWhatsappTemplate(input, deps)).toEqual({ ok: true, id: "wamid.XYZ", simulated: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v21.0/123456789012345/messages");
    expect(init.headers.authorization).toBe("Bearer tok_secret_value");
    expect(init.redirect).toBe("error");
    expect(JSON.parse(init.body)).toEqual({
      messaging_product: "whatsapp", to: "51999999999", type: "template",
      template: { name: "booking_confirmed", language: { code: "es" }, components: [{ type: "body", parameters: [{ type: "text", text: "Ana" }, { type: "text", text: "12 nov" }] }] },
    });
    expect(record).toHaveBeenCalledWith({ orgId: "org-1", bookingId: "b-1", template: "booking_confirmed", language: "es", wamid: "wamid.XYZ", mode: "live" });
  });
  it("omits components when there are no params, and strips newlines/tabs from params (Meta rejects them)", async () => {
    const a = mkDeps();
    a.fetchMock.mockResolvedValue(jsonRes(200, { messages: [{ id: "w1" }] }));
    await sendWhatsappTemplate({ ...input, params: [] }, a.deps);
    expect(JSON.parse(a.fetchMock.mock.calls[0][1].body).template.components).toBeUndefined();
    const b = mkDeps();
    b.fetchMock.mockResolvedValue(jsonRes(200, { messages: [{ id: "w2" }] }));
    await sendWhatsappTemplate({ ...input, params: ["line1\nline2\t!"] }, b.deps);
    expect(JSON.parse(b.fetchMock.mock.calls[0][1].body).template.components[0].parameters[0].text).toBe("line1 line2 !");
  });
  it("maps a 4xx to rejected (keeping only the numeric provider code) and does not record", async () => {
    const { deps, fetchMock, record, log } = mkDeps();
    fetchMock.mockResolvedValue(jsonRes(400, { error: { code: 132001, message: "Template name does not exist in 51999999999" } }));
    expect(await sendWhatsappTemplate(input, deps)).toEqual({ ok: false, reason: "rejected" });
    expect(record).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).toContain("132001");
    expect(JSON.stringify(log.mock.calls)).not.toContain("51999999999");
  });
  it.each([500, 503, 429])("maps HTTP %i to unavailable", async (status) => {
    const { deps, fetchMock } = mkDeps();
    fetchMock.mockResolvedValue(jsonRes(status, {}));
    expect(await sendWhatsappTemplate(input, deps)).toEqual({ ok: false, reason: "unavailable" });
  });
  it("does NOT retry after a timeout or network error (no idempotency key: a retry could message twice)", async () => {
    const { deps, fetchMock } = mkDeps();
    fetchMock.mockRejectedValue(new Error("boom 51999999999"));
    expect(await sendWhatsappTemplate(input, deps)).toEqual({ ok: false, reason: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("treats a 200 without a message id as unavailable", async () => {
    const { deps, fetchMock } = mkDeps();
    fetchMock.mockResolvedValue(jsonRes(200, { messages: [] }));
    expect(await sendWhatsappTemplate(input, deps)).toEqual({ ok: false, reason: "unavailable" });
  });
  it("a failing ledger write never turns a delivered send into an error", async () => {
    const { deps, fetchMock, record, log } = mkDeps();
    fetchMock.mockResolvedValue(jsonRes(200, { messages: [{ id: "wamid.OK" }] }));
    record.mockRejectedValue(new Error("db down"));
    expect(await sendWhatsappTemplate(input, deps)).toEqual({ ok: true, id: "wamid.OK", simulated: false });
    expect(log).toHaveBeenCalledWith("error", "whatsapp.record_failed", expect.anything());
  });
  it("never logs the recipient, the token or the params", async () => {
    const { deps, fetchMock, log } = mkDeps();
    fetchMock.mockResolvedValue(jsonRes(200, { messages: [{ id: "wamid.OK" }] }));
    await sendWhatsappTemplate(input, deps);
    const all = JSON.stringify(log.mock.calls);
    for (const secret of ["51999999999", "tok_secret_value", "Ana", "12 nov"]) expect(all).not.toContain(secret);
  });
});
