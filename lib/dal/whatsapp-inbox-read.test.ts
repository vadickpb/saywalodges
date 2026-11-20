import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const rpc = vi.fn();
const order = vi.fn();
const eq = vi.fn();
vi.mock("@/lib/dal/organizations", () => ({ requireActiveOrg: async () => ({ activeOrg: { id: "22222222-2222-4222-8222-222222222222", role: "staff" } }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc, from: () => ({ select: () => ({ eq: (...a: unknown[]) => { eq(...a); return { order: () => ({ limit: order }) }; } }) }) }) }));
vi.mock("@/lib/log", () => ({ log: vi.fn() }));
import { listInbox, markInboxRead } from "./whatsapp-inbox-read";

beforeEach(() => vi.clearAllMocks());
describe("whatsapp inbox reads", () => {
  it("lists the active organization's messages through RLS", async () => {
    order.mockResolvedValue({ data: [{ id: "i1", from_phone: "51999111222", profile_name: null, msg_type: "text", body: "hola", received_at: "2026-11-20T10:00:00Z", read_at: null, auto_replied_at: "2026-11-20T10:00:01Z" }], error: null });
    expect(await listInbox()).toEqual([{ id: "i1", fromPhone: "51999111222", name: null, type: "text", body: "hola", receivedAt: "2026-11-20T10:00:00Z", read: false, autoReplied: true }]);
    expect(eq).toHaveBeenCalledWith("org_id", "22222222-2222-4222-8222-222222222222");
  });
  it("hides database detail on failure", async () => {
    order.mockResolvedValue({ data: null, error: { code: "XX000", message: "secret" } });
    await expect(listInbox()).rejects.toThrow("No se pudo leer la bandeja de WhatsApp.");
  });
  it("marks read for the session's organization only", async () => {
    rpc.mockResolvedValue({ error: null });
    await markInboxRead();
    expect(rpc).toHaveBeenCalledWith("mark_whatsapp_inbox_read", { p_org_id: "22222222-2222-4222-8222-222222222222" });
    rpc.mockResolvedValue({ error: { code: "42501", message: "secret" } });
    await expect(markInboxRead()).rejects.toThrow("No se pudo marcar como leída la bandeja.");
  });
});
