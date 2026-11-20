import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const rpc = vi.fn();
const select = vi.fn();
const org = vi.hoisted(() => ({ value: { activeOrg: { id: "22222222-2222-4222-8222-222222222222", role: "owner" } } as { activeOrg: { id: string; role: string } | null } }));
vi.mock("@/lib/dal/organizations", () => ({ requireActiveOrg: async () => org.value }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc, from: () => ({ select: () => ({ eq: select }) }) }) }));
vi.mock("@/lib/log", () => ({ log: vi.fn() }));
import { listWhatsappRules, NotOwnerError, saveWhatsappRule } from "./whatsapp-rules";

const rule = { kind: "arrival_reminder", enabled: true, offsetDays: 2, windowStart: 9, windowEnd: 20 };
beforeEach(() => { vi.clearAllMocks(); org.value = { activeOrg: { id: "22222222-2222-4222-8222-222222222222", role: "owner" } }; rpc.mockResolvedValue({ error: null }); });

describe("whatsapp rules DAL", () => {
  it("saves with the organization from the session, never from the input", async () => {
    await saveWhatsappRule({ ...rule, orgId: "other", org_id: "other" });
    expect(rpc).toHaveBeenCalledWith("set_whatsapp_rule", { p_org_id: "22222222-2222-4222-8222-222222222222", p_kind: "arrival_reminder", p_enabled: true, p_offset_days: 2, p_window_start: 9, p_window_end: 20 });
  });
  it("refuses staff before touching the database, and maps the database refusal too", async () => {
    org.value = { activeOrg: { id: "22222222-2222-4222-8222-222222222222", role: "staff" } };
    await expect(saveWhatsappRule(rule)).rejects.toBeInstanceOf(NotOwnerError);
    expect(rpc).not.toHaveBeenCalled();
    org.value = { activeOrg: { id: "22222222-2222-4222-8222-222222222222", role: "owner" } };
    rpc.mockResolvedValue({ error: { code: "42501", message: "secret" } });
    await expect(saveWhatsappRule(rule)).rejects.toBeInstanceOf(NotOwnerError);
  });
  it("rejects invalid rules and hides database messages", async () => {
    await expect(saveWhatsappRule({ ...rule, windowStart: 20, windowEnd: 9 })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ error: { code: "XX000", message: "relation secret" } });
    await expect(saveWhatsappRule(rule)).rejects.toThrow("No se pudo guardar la regla.");
  });
  it("lists the four rules, saved ones over the defaults", async () => {
    select.mockResolvedValue({ data: [{ kind: "confirmation", enabled: false, offset_days: 0, window_start: 0, window_end: 24 }], error: null });
    const rules = await listWhatsappRules();
    expect(rules).toHaveLength(4);
    expect(rules[0]).toMatchObject({ kind: "confirmation", enabled: false });
  });
});
