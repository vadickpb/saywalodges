import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));
const sole = async () => true;
import { ownerWhatsappPhone, sendOwnerWhatsappAlert } from "./owner-alert";

const alert = { kind: "owner_new_booking" as const, orgId: "22222222-2222-4222-8222-222222222222", bookingId: null, params: ["Casa 1", "a", "b"] };
const live = { mode: "live" as const, accessToken: "t", phoneNumberId: "123456", apiVersion: "v23.0" };
const okFetch = () => vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 })) as unknown as typeof fetch;

describe("owner WhatsApp alerts", () => {
  it("normalises the owner number and ignores a missing or unusable one", () => {
    expect(ownerWhatsappPhone({ WHATSAPP_OWNER_PHONE: "+51 999 111 222" })).toBe("51999111222");
    for (const v of [undefined, "", "12345"]) expect(ownerWhatsappPhone({ WHATSAPP_OWNER_PHONE: v })).toBeNull();
  });
  it("without an owner number nothing is sent", async () => {
    const fetchMock = okFetch();
    expect(await sendOwnerWhatsappAlert(alert, {}, { config: live, fetch: fetchMock, record: async () => {} }, sole)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("a live delivery to the owner number is true and records the ledger row with the server's org", async () => {
    const record = vi.fn(async () => {});
    const fetchMock = okFetch();
    expect(await sendOwnerWhatsappAlert(alert, { WHATSAPP_OWNER_PHONE: "999111222" }, { config: live, fetch: fetchMock, record, log: () => {} }, sole)).toBe(true);
    expect(JSON.parse((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body)).toMatchObject({ to: "51999111222", template: { name: "owner_new_booking", language: { code: "es" } } });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ orgId: alert.orgId, template: "owner_new_booking" }));
  });
  it("simulation and failures are false", async () => {
    const log = () => {};
    expect(await sendOwnerWhatsappAlert(alert, { WHATSAPP_OWNER_PHONE: "999111222" }, { config: { mode: "simulate" }, record: async () => {}, log }, sole)).toBe(false);
    expect(await sendOwnerWhatsappAlert(alert, { WHATSAPP_OWNER_PHONE: "999111222" }, { config: { mode: "disabled", reason: "missing_credentials" }, log }, sole)).toBe(false);
    const down = vi.fn(async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    expect(await sendOwnerWhatsappAlert(alert, { WHATSAPP_OWNER_PHONE: "999111222" }, { config: live, fetch: down, log }, sole)).toBe(false);
  });
  it("with more than one organization in the database it never sends (an alert could reach another tenant's owner)", async () => {
    const fetchMock = okFetch();
    expect(await sendOwnerWhatsappAlert(alert, { WHATSAPP_OWNER_PHONE: "999111222" }, { config: live, fetch: fetchMock, record: async () => {}, log: () => {} }, async () => false)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
