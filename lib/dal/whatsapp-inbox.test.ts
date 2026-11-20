import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock("@/lib/env", () => ({ env: { ROOT_DOMAIN: "saywalodges.com" } }));
const log = vi.fn();
vi.mock("@/lib/log", () => ({ log: (...a: unknown[]) => log(...a) }));
import { handleInboundMessage } from "./whatsapp-inbox";

const ORG = "22222222-2222-4222-8222-222222222222";
const msg = { wamid: "w1", from: "51999111222", name: "Ana", type: "text", body: "hola", at: new Date("2026-11-20T10:00:00Z") };
const client = (result: unknown, extra: Record<string, unknown> = {}) => ({
  rpc: vi.fn(async (name: string) => name === "record_inbound_whatsapp" ? { data: result, error: null } : (extra[name] ?? { data: 0, error: null })),
}) as never;
const ok = () => vi.fn(async () => ({ ok: true as const, id: "wamid.R", simulated: false }));
beforeEach(() => vi.clearAllMocks());

describe("handleInboundMessage", () => {
  it("sends the auto-reply only when the database granted it, with the org from the database", async () => {
    const send = ok();
    const c = client({ status: "stored", reply: true, org_id: ORG });
    expect(await handleInboundMessage(msg, { client: c, send, source: {} })).toBe("stored");
    expect(send).toHaveBeenCalledWith({ orgId: ORG, to: "51999111222", body: expect.stringContaining("https://saywalodges.com/es/cotizar"), inWindow: true });
    expect((c as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith("record_inbound_whatsapp", expect.objectContaining({ p_auto_reply: true, p_from: "51999111222", p_name: "Ana" }));
  });
  it("never replies to a duplicate, to a message nobody can own, or when the database says no", async () => {
    for (const result of [{ status: "duplicate", reply: false }, { status: "no_org", reply: false }, { status: "stored", reply: false, org_id: ORG }]) {
      const send = ok();
      await handleInboundMessage(msg, { client: client(result), send, source: {} });
      expect(send).not.toHaveBeenCalled();
    }
  });
  it("auto-reply off or a STOP keyword: the database is told not to reply, and STOP withdraws consent", async () => {
    const send = ok();
    const off = client({ status: "stored", reply: false, org_id: ORG });
    await handleInboundMessage(msg, { client: off, send, source: { WHATSAPP_AUTO_REPLY: "off" } });
    expect((off as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith("record_inbound_whatsapp", expect.objectContaining({ p_auto_reply: false }));
    const stop = client({ status: "stored", reply: false, org_id: ORG });
    await handleInboundMessage({ ...msg, body: "STOP" }, { client: stop, send, source: {} });
    const rpc = (stop as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc;
    expect(rpc).toHaveBeenCalledWith("record_inbound_whatsapp", expect.objectContaining({ p_auto_reply: false }));
    expect(rpc).toHaveBeenCalledWith("revoke_whatsapp_optins", { p_from: "51999111222" });
    expect(send).not.toHaveBeenCalled();
  });
  it("a failing reply never fails the webhook; a failing store does (so Meta redelivers)", async () => {
    const send = vi.fn(async () => { throw new Error("boom"); });
    await expect(handleInboundMessage(msg, { client: client({ status: "stored", reply: true, org_id: ORG }), send, source: {} })).resolves.toBe("stored");
    const failing = { rpc: vi.fn(async () => ({ data: null, error: { code: "XX000", message: "secret" } })) } as never;
    await expect(handleInboundMessage(msg, { client: failing, send: ok(), source: {} })).rejects.toThrow();
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });
});
