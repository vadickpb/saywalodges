import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));
const log = vi.fn();
vi.mock("@/lib/log", () => ({ log: (...args: unknown[]) => log(...args) }));
import { deliverWhatsappMessages, purgeWhatsappRecords } from "./whatsapp-dispatch";

const claim = {
  id: "11111111-1111-4111-8111-111111111111", kind: "confirmation", org_id: "22222222-2222-4222-8222-222222222222",
  booking_id: "33333333-3333-4333-8333-333333333333", opt_in: true, phone: "+51 999 888 777", lang: "es", guest_name: "Ana Pérez",
  unit: "Casa 1", check_in: "2030-12-21", check_out: "2030-12-24", currency: "PEN", deposit_cents: 30000, expires_at: null,
};
const sim = { WHATSAPP_MODE: "simulate" };

function fakeClient(claims: unknown[]) {
  const queue = [...claims];
  const rpc = vi.fn(async (name: string) => {
    if (name === "cron_claim_whatsapp_message") return { data: queue.length ? queue.shift() : null, error: null };
    return { data: null, error: null };
  });
  return { rpc } as unknown as Parameters<typeof deliverWhatsappMessages>[0] & { rpc: typeof rpc };
}
const ok = (simulated: boolean) => vi.fn(async () => ({ ok: true as const, id: "wamid.X", simulated }));
const settled = (client: { rpc: ReturnType<typeof vi.fn> }) =>
  client.rpc.mock.calls.filter(([n]) => n === "cron_settle_whatsapp_message").map(([, a]) => a);

beforeEach(() => vi.clearAllMocks());

describe("deliverWhatsappMessages", () => {
  it("sends one template per claim with org and booking from the claim, and settles it", async () => {
    const client = fakeClient([claim]);
    const send = ok(true);
    const summary = await deliverWhatsappMessages(client, send, sim);
    expect(summary).toEqual({ status: "ok", sent: 0, simulated: 1, failed: 0, skipped: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      orgId: claim.org_id, bookingId: claim.booking_id, to: "51999888777", template: "booking_confirmation", language: "es",
      params: ["Ana", "Casa 1", expect.any(String), expect.any(String)], optIn: true,
    });
    expect(settled(client)).toEqual([{ p_id: claim.id, p_outcome: "simulated" }]);
  });

  it("never sends a claim that lacks the literal opt-in, and closes it as failed", async () => {
    for (const bad of [{ ...claim, opt_in: false }, Object.fromEntries(Object.entries(claim).filter(([key]) => key !== "opt_in"))]) {
      const client = fakeClient([bad]);
      const send = ok(false);
      const summary = await deliverWhatsappMessages(client, send, sim);
      expect(send).not.toHaveBeenCalled();
      expect(summary.failed).toBe(1);
      expect(settled(client)).toEqual([{ p_id: claim.id, p_outcome: "failed" }]);
    }
  });

  it("skips (never guesses) a phone that cannot be normalised", async () => {
    const client = fakeClient([{ ...claim, phone: "12345" }]);
    const send = ok(false);
    const summary = await deliverWhatsappMessages(client, send, sim);
    expect(send).not.toHaveBeenCalled();
    expect(summary.skipped).toBe(1);
    expect(settled(client)).toEqual([{ p_id: claim.id, p_outcome: "skipped" }]);
  });

  it("counts the database's own skips (consent withdrawn, booking changed) without sending", async () => {
    const client = fakeClient([{ skip: true }, { skip: true }]);
    const send = ok(false);
    expect(await deliverWhatsappMessages(client, send, sim)).toMatchObject({ skipped: 2, sent: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("does not retry: a failed or throwing send is settled as failed, once", async () => {
    for (const send of [vi.fn(async () => ({ ok: false as const, reason: "unavailable" as const })), vi.fn(async () => { throw new Error("boom"); })]) {
      const client = fakeClient([claim]);
      const summary = await deliverWhatsappMessages(client, send as never, sim);
      expect(summary.failed).toBe(1);
      expect(send).toHaveBeenCalledTimes(1);
      expect(settled(client)).toEqual([{ p_id: claim.id, p_outcome: "failed" }]);
    }
  });

  it("reports a live send as sent", async () => {
    const client = fakeClient([claim]);
    const live = { WHATSAPP_ACCESS_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "123456", WHATSAPP_API_VERSION: "v23.0", WHATSAPP_MODE: "live" };
    expect(await deliverWhatsappMessages(client, ok(false), live)).toMatchObject({ sent: 1, simulated: 0 });
  });

  it("production without credentials claims nothing and sends nothing (it does not pretend)", async () => {
    const client = fakeClient([claim]);
    const send = ok(true);
    const summary = await deliverWhatsappMessages(client, send, { VERCEL_ENV: "production" });
    expect(summary.status).toBe("not_configured");
    expect(client.rpc).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("production in simulate mode is also refused", async () => {
    const client = fakeClient([claim]);
    const summary = await deliverWhatsappMessages(client, ok(true), { VERCEL_ENV: "production", WHATSAPP_MODE: "simulate" });
    expect(summary.status).toBe("not_configured");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("passes the configured arrival window and rejects an invalid one", async () => {
    const client = fakeClient([]);
    await deliverWhatsappMessages(client, ok(true), { ...sim, WHATSAPP_ARRIVAL_DAYS: "2" });
    expect(client.rpc).toHaveBeenCalledWith("cron_claim_whatsapp_message", { p_arrival_days: 2 });
    await expect(deliverWhatsappMessages(fakeClient([]), ok(true), { ...sim, WHATSAPP_ARRIVAL_DAYS: "99" })).rejects.toThrow();
  });

  it("surfaces a claim failure without leaking the database message", async () => {
    const client = { rpc: vi.fn(async () => ({ data: null, error: { code: "XX000", message: "secret detail" } })) } as never;
    await expect(deliverWhatsappMessages(client, ok(true), sim)).rejects.toThrow("WhatsApp claim failed");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret detail");
  });
});

describe("purgeWhatsappRecords", () => {
  it("uses the retention setting (365 days by default)", async () => {
    const rpc = vi.fn(async () => ({ data: { messages: 2, outbox: 1 }, error: null }));
    expect(await purgeWhatsappRecords({ rpc } as never, {})).toEqual({ messages: 2, outbox: 1 });
    expect(rpc).toHaveBeenCalledWith("cron_purge_whatsapp", { p_days: 365 });
    await purgeWhatsappRecords({ rpc } as never, { WHATSAPP_RETENTION_DAYS: "90" });
    expect(rpc).toHaveBeenLastCalledWith("cron_purge_whatsapp", { p_days: 90 });
  });
  it("rejects a retention below 30 days and database errors", async () => {
    await expect(purgeWhatsappRecords({ rpc: vi.fn() } as never, { WHATSAPP_RETENTION_DAYS: "5" })).rejects.toThrow();
    await expect(purgeWhatsappRecords({ rpc: vi.fn(async () => ({ data: null, error: { code: "42501" } })) } as never, {})).rejects.toThrow("WhatsApp purge failed");
  });
});
