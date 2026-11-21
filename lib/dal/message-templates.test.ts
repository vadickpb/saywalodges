import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const rpc = vi.fn();
const tables = vi.hoisted(() => ({ templates: { data: [] as unknown, error: null as unknown }, house: { data: null as unknown, error: null as unknown } }));
const org = vi.hoisted(() => ({ value: { activeOrg: { id: "22222222-2222-4222-8222-222222222222", role: "owner" } } as { activeOrg: { id: string; role: string } | null } }));
vi.mock("@/lib/dal/organizations", () => ({ requireActiveOrg: async () => org.value }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc,
    from: (table: string) => ({ select: () => ({ eq: () => (table === "message_templates" ? Promise.resolve(tables.templates) : { maybeSingle: async () => tables.house }) }) }),
  }),
}));
const log = vi.fn();
vi.mock("@/lib/log", () => ({ log: (...a: unknown[]) => log(...a) }));
import { DEFAULT_TEMPLATES } from "@/lib/domain/message-templates";
import { getMessageLibrary, NotOwnerError, nextCustomKey, resetTemplate, saveHouseInfo, saveTemplate } from "./message-templates";

const ORG = "22222222-2222-4222-8222-222222222222";
const tpl = { key: "welcome", title: "Mi bienvenida", bodyEs: "{saludo}", bodyEn: "{saludo}", anchor: "check_in", offsetDays: "0" };
beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ error: null });
  tables.templates = { data: [], error: null };
  tables.house = { data: null, error: null };
  org.value = { activeOrg: { id: ORG, role: "owner" } };
});

describe("getMessageLibrary", () => {
  it("without anything saved it is the built-in library and an empty house", async () => {
    const lib = await getMessageLibrary();
    expect(lib.templates).toEqual(DEFAULT_TEMPLATES);
    expect(lib.house.wifiName).toBeNull();
  });
  it("merges what the owner customized and maps the house row", async () => {
    tables.templates = { data: [{ key: "welcome", title: "Mi bienvenida", body_es: "Hola {nombre}", body_en: "Hi {nombre}", anchor: null, offset_days: null }], error: null };
    tables.house = { data: { checkin_time: "14:00", checkout_time: "11:00", wifi_name: "Saywa", wifi_password: "x", door_code: null, location_url: null, contact_phone: null, rules_es: null, rules_en: null }, error: null };
    const lib = await getMessageLibrary();
    expect(lib.templates.find((t) => t.key === "welcome")).toMatchObject({ title: "Mi bienvenida", bodyEs: "Hola {nombre}" });
    expect(lib.house).toMatchObject({ checkinTime: "14:00", wifiName: "Saywa", wifiPassword: "x" });
  });
  it("a read failure falls back to the built-ins and logs only the code", async () => {
    tables.templates = { data: null, error: { code: "XX000", message: "secret" } };
    const lib = await getMessageLibrary();
    expect(lib.templates).toEqual(DEFAULT_TEMPLATES);
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });
});

describe("writes (owner only)", () => {
  it("saves a message with the organization from the session", async () => {
    await saveTemplate({ ...tpl, org_id: "other" });
    expect(rpc).toHaveBeenCalledWith("save_message_template", { p_org_id: ORG, p_key: "welcome", p_title: "Mi bienvenida", p_body_es: "{saludo}", p_body_en: "{saludo}", p_anchor: "check_in", p_offset: 0 });
  });
  it("refuses staff before touching the database, and maps the database refusal", async () => {
    org.value = { activeOrg: { id: ORG, role: "staff" } };
    await expect(saveTemplate(tpl)).rejects.toBeInstanceOf(NotOwnerError);
    await expect(resetTemplate("welcome")).rejects.toBeInstanceOf(NotOwnerError);
    await expect(saveHouseInfo({})).rejects.toBeInstanceOf(NotOwnerError);
    expect(rpc).not.toHaveBeenCalled();
    org.value = { activeOrg: { id: ORG, role: "owner" } };
    rpc.mockResolvedValue({ error: { code: "42501", message: "secret" } });
    await expect(saveTemplate(tpl)).rejects.toBeInstanceOf(NotOwnerError);
  });
  it("rejects invalid input before the database, and hides database detail", async () => {
    await expect(saveTemplate({ ...tpl, bodyEs: "Hola {nombrre}" })).rejects.toThrow();
    await expect(resetTemplate("nope")).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ error: { code: "XX000", message: "relation secret" } });
    await expect(saveTemplate(tpl)).rejects.toThrow("No se pudo guardar. Inténtalo de nuevo.");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });
  it("saves the house data sending empty strings for blanks and restores a message by key", async () => {
    await saveHouseInfo({ checkinTime: "14:00", wifiName: "Saywa", locationUrl: "https://maps.app.goo.gl/x" });
    expect(rpc).toHaveBeenCalledWith("save_message_house_info", expect.objectContaining({ p_org_id: ORG, p_checkin: "14:00", p_checkout: "", p_wifi_name: "Saywa", p_location_url: "https://maps.app.goo.gl/x", p_door_code: "" }));
    await resetTemplate("welcome");
    expect(rpc).toHaveBeenLastCalledWith("delete_message_template", { p_org_id: ORG, p_key: "welcome" });
  });
  it("offers the first free custom slot, or none when all six are used", () => {
    expect(nextCustomKey(DEFAULT_TEMPLATES)).toBe("custom_1");
    const used = ["custom_1", "custom_2", "custom_3", "custom_4", "custom_5", "custom_6"].map((key) => ({ ...DEFAULT_TEMPLATES[0], key })) as never;
    expect(nextCustomKey(used)).toBeNull();
  });
});
