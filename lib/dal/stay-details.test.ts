import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const rpc = vi.fn();
vi.mock("@/lib/dal/organizations", () => ({ requireActiveOrg: async () => ({ activeOrg: { id: "22222222-2222-4222-8222-222222222222", role: "staff" } }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));
const log = vi.fn();
vi.mock("@/lib/log", () => ({ log: (...a: unknown[]) => log(...a) }));
import { readStayDetails, saveStayDetails, stayMapKey } from "./stay-details";

const ORG = "22222222-2222-4222-8222-222222222222";
const BOOKING = "33333333-3333-4333-8333-333333333333";
const FEED = "44444444-4444-4444-8444-444444444444";
const UID = "a".repeat(64);
const details = { name: "Ana Pérez", phone: "", lang: "es", party: "3", arrival: "", requests: ["crib"], note: "", remindOn: "2030-01-02" };
beforeEach(() => { vi.clearAllMocks(); rpc.mockResolvedValue({ error: null }); });

describe("saveStayDetails", () => {
  it("saves a booking's details with the organization from the session, never from the input", async () => {
    await saveStayDetails({ bookingId: BOOKING, orgId: "other" }, { ...details, org_id: "other" });
    expect(rpc).toHaveBeenCalledWith("save_stay_details", {
      p_org_id: ORG, p_booking_id: BOOKING, p_feed_id: null, p_external_uid: null, p_name: "Ana Pérez", p_phone: "", p_lang: "es", p_party: 3, p_arrival: "",
      p_requests: ["crib"], p_note: "", p_remind_on: "2030-01-02",
    });
  });
  it("saves an iCal stay by feed and hashed uid", async () => {
    await saveStayDetails({ feedId: FEED, externalUid: UID }, details);
    expect(rpc).toHaveBeenCalledWith("save_stay_details", expect.objectContaining({ p_org_id: ORG, p_booking_id: null, p_feed_id: FEED, p_external_uid: UID }));
  });
  it("rejects a bad key or bad details before touching the database", async () => {
    await expect(saveStayDetails({}, details)).rejects.toThrow();
    await expect(saveStayDetails({ bookingId: BOOKING, feedId: FEED, externalUid: UID }, details)).rejects.toThrow();
    await expect(saveStayDetails({ bookingId: BOOKING }, { ...details, requests: ["x"] })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("hides database detail, logging only the code", async () => {
    rpc.mockResolvedValue({ error: { code: "42501", message: "secret detail" } });
    await expect(saveStayDetails({ bookingId: BOOKING }, details)).rejects.toThrow("No se pudieron guardar los datos de la estadía.");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });
});

describe("readStayDetails", () => {
  const row = { booking_id: BOOKING, feed_id: null, external_uid: null, guest_name: "Ana", guest_phone: null, lang: "en", party_size: 2, arrival_time: "15:00", requests: ["crib", "teleport"], note: null, remind_on: null, ref_code: null, phone_last4: null };
  const client = (rows: unknown, error: unknown = null) => ({ from: () => ({ select: () => ({ eq: () => ({ in: async () => ({ data: rows, error }) }) }) }) }) as never;
  it("maps rows by stay key and drops unknown chips", async () => {
    const map = await readStayDetails(client([row]), ORG, { bookingIds: [BOOKING], externalUids: [] });
    expect(map.get(stayMapKey({ bookingId: BOOKING }))).toMatchObject({ name: "Ana", lang: "en", party: 2, arrival: "15:00", requests: ["crib"] });
  });
  it("a failure returns nothing instead of failing the page", async () => {
    const map = await readStayDetails(client(null, { code: "XX000", message: "secret" }), ORG, { bookingIds: [BOOKING], externalUids: [UID] });
    expect(map.size).toBe(0);
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });
  it("asks nothing when there are no stays", async () => {
    const from = vi.fn();
    expect((await readStayDetails({ from } as never, ORG, { bookingIds: [], externalUids: [] })).size).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });
});
