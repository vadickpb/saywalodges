import { describe, it, expect, vi } from "vitest";
import type { EmailConfig } from "./config";
import { sendEmail, type EmailDeps, type SendEmailInput } from "./send";

const KEY = "re_test_key_not_real";
const GUEST = "guest.person@example.org";
const NAME = "Guest Personname";
const resend: EmailConfig = { mode: "resend", apiKey: KEY, from: "Saywa <no-reply@mail.example.com>", allowedRecipients: null };
const input: SendEmailInput = { template: "test", lang: "es", to: GUEST, props: { name: NAME } };

type Logged = [string, string, Record<string, unknown>];
function harness(responses: Array<Response | Error>, config: EmailConfig = resend) {
  const logs: Logged[] = [];
  const queue = [...responses];
  const fetchMock = vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error("unexpected extra request");
    if (next instanceof Error) throw next;
    return next;
  });
  const sleep = vi.fn(async () => {});
  const deps: EmailDeps = {
    config,
    fetch: fetchMock as unknown as typeof fetch,
    sleep,
    log: (level, event, fields) => logs.push([level, event, fields]),
  };
  return { deps, fetchMock, sleep, logs };
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("sendEmail", () => {
  it("posts the rendered email to Resend with auth and an idempotency key", async () => {
    const { deps, fetchMock } = harness([json(200, { id: "msg_1" })]);
    const result = await sendEmail({ ...input, idempotencyKey: "booking:1:confirmed" }, deps);
    expect(result).toEqual({ ok: true, id: "msg_1", simulated: false });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(headers["Idempotency-Key"]).toBe("booking:1:confirmed");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ from: resend.mode === "resend" && resend.from, to: [GUEST], subject: "Correo de prueba · Saywa Direct" });
    expect(body.html).toContain("Hola Guest Personname,");
    expect(body.text).toContain("Hola Guest Personname,");
  });

  it("renders with the brand it is given, falling back to the environment", async () => {
    const { deps, fetchMock } = harness([json(200, { id: "msg_b" }), json(200, { id: "msg_c" })]);
    await sendEmail(input, { ...deps, brand: { name: "Casa Marian", poweredBy: false } });
    const first = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(first.subject).toBe("Correo de prueba · Casa Marian");
    expect(first.html).not.toContain("Saywa Direct");
    await sendEmail(input, deps);
    const second = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(second.subject).toBe("Correo de prueba · Saywa Direct");
  });

  it("simulates without any network call and returns a recognisable id", async () => {
    const { deps, fetchMock } = harness([], { mode: "simulate" });
    const result = await sendEmail(input, deps);
    expect(result).toMatchObject({ ok: true, simulated: true });
    expect(result.ok && result.id.startsWith("sim_")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still validates and renders in simulation, so template bugs surface in CI", async () => {
    const { deps } = harness([], { mode: "simulate" });
    expect(await sendEmail({ ...input, props: { name: 42 } as never }, deps)).toEqual({ ok: false, reason: "invalid_input" });
    expect(await sendEmail({ ...input, to: "nope" }, deps)).toEqual({ ok: false, reason: "invalid_input" });
  });

  it("returns not_configured when disabled and never touches the network", async () => {
    const { deps, fetchMock } = harness([], { mode: "disabled", reason: "missing_api_key" });
    expect(await sendEmail(input, deps)).toEqual({ ok: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks recipients outside the preview allow-list", async () => {
    const { deps, fetchMock } = harness([], { ...resend, allowedRecipients: ["owner@example.com"] } as EmailConfig);
    expect(await sendEmail(input, deps)).toEqual({ ok: false, reason: "recipient_not_allowed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries 5xx and 429 with exponential backoff, reusing the same idempotency key", async () => {
    const { deps, fetchMock, sleep } = harness([json(503, { name: "application_error" }), json(429, { name: "rate_limit_exceeded" }), json(200, { id: "msg_2" })]);
    expect(await sendEmail(input, deps)).toEqual({ ok: true, id: "msg_2", simulated: false });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => (c as unknown as [number])[0])).toEqual([300, 600]);
    const keys = fetchMock.mock.calls.map((c) => ((c as unknown as [string, RequestInit])[1].headers as Record<string, string>)["Idempotency-Key"]);
    expect(new Set(keys).size).toBe(1);
  });

  it("retries network errors and gives up as unavailable after 3 attempts", async () => {
    const { deps, fetchMock, logs } = harness([new Error(`connect ECONNREFUSED ${GUEST}`), new Error("boom"), new Error("boom")]);
    expect(await sendEmail(input, deps)).toEqual({ ok: false, reason: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(logs.at(-1)?.[1]).toBe("email.gave_up");
  });

  it("does not retry a 4xx rejection", async () => {
    const { deps, fetchMock } = harness([json(422, { name: "validation_error", message: `invalid to ${GUEST}` })]);
    expect(await sendEmail(input, deps)).toEqual({ ok: false, reason: "rejected" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries only the concurrent-idempotency 409, not other 409s", async () => {
    const a = harness([json(409, { name: "concurrent_idempotent_requests" }), json(200, { id: "msg_3" })]);
    expect((await sendEmail(input, a.deps)).ok).toBe(true);
    const b = harness([json(409, { name: "invalid_idempotent_request" })]);
    expect(await sendEmail(input, b.deps)).toEqual({ ok: false, reason: "rejected" });
    expect(b.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a 2xx with an unreadable body as sent, never retrying into a duplicate", async () => {
    const { deps, fetchMock } = harness([new Response("<html>ok</html>", { status: 200 })]);
    expect(await sendEmail(input, deps)).toEqual({ ok: true, id: "unknown", simulated: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never logs PII, the API key or provider error text", async () => {
    const failure = harness([json(422, { name: "validation_error", message: `bad address ${GUEST}` })]);
    await sendEmail(input, failure.deps);
    const network = harness([new Error(`getaddrinfo ${GUEST} ${KEY}`), new Error("x"), new Error("y")]);
    await sendEmail(input, network.deps);
    const ok = harness([json(200, { id: "msg_4" })]);
    await sendEmail(input, ok.deps);
    const sim = harness([], { mode: "simulate" });
    await sendEmail(input, sim.deps);

    const dump = JSON.stringify([...failure.logs, ...network.logs, ...ok.logs, ...sim.logs]);
    expect(dump).not.toContain(GUEST);
    expect(dump).not.toContain("Personname");
    expect(dump).not.toContain(KEY);
    expect(dump).not.toContain("bad address");
    expect(dump).not.toContain("Correo de prueba");
    expect(dump).toContain("validation_error");
  });

  it("default logger writes JSON without PII", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    await sendEmail(input, { config: { mode: "simulate" } });
    const line = String(spy.mock.calls[0]?.[0]);
    spy.mockRestore();
    expect(JSON.parse(line)).toMatchObject({ event: "email.simulated", template: "test", lang: "es", mode: "simulate" });
    expect(line).not.toContain(GUEST);
  });
});
