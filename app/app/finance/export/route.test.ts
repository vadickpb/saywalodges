import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const getFinanceContext = vi.fn();
vi.mock("../_lib/context", () => ({ getFinanceContext: () => getFinanceContext() }));
const listAllEntries = vi.fn();
const listCategories = vi.fn();
vi.mock("@/lib/dal/finance", () => ({ listAllEntries: (...a: unknown[]) => listAllEntries(...a), listCategories: (...a: unknown[]) => listCategories(...a) }));
const listReportUnits = vi.fn();
vi.mock("@/lib/dal/finance-reports", () => ({ listReportUnits: (...a: unknown[]) => listReportUnits(...a) }));
const getOrgProperty = vi.fn();
vi.mock("@/lib/dal/organizations", () => ({ getOrgProperty: (...a: unknown[]) => getOrgProperty(...a) }));
import { GET } from "./route";

const ORG = "bf88f504-051f-4fdc-ab73-4fa12d715817";
const owner = { supabase: {}, orgId: ORG, role: "owner", isOwner: true };
const call = (query: string) => GET(new Request(`http://app.localhost:3000/app/finance/export${query}`));

beforeEach(() => {
  vi.clearAllMocks();
  getFinanceContext.mockResolvedValue(owner);
  listAllEntries.mockResolvedValue({ entries: [], truncated: false });
  listCategories.mockResolvedValue([]);
  listReportUnits.mockResolvedValue([]);
  getOrgProperty.mockResolvedValue({ name: "Saywa Lodges" });
});

describe("GET /app/finance/export", () => {
  it("answers an empty 404 to staff and to a caller without an org, and reads nothing", async () => {
    getFinanceContext.mockResolvedValue({ ...owner, role: "staff", isOwner: false });
    const staff = await call("?month=2027-03");
    expect(staff.status).toBe(404);
    expect(await staff.text()).toBe("");
    getFinanceContext.mockResolvedValue(null);
    expect((await call("?month=2027-03")).status).toBe(404);
    expect(listAllEntries).not.toHaveBeenCalled();
  });

  it("sends an invalid period back to the reports page with a fixed code", async () => {
    for (const q of ["?month=2027-99", "?from=2027-03-31&to=2027-03-01", ""]) {
      const res = await call(q);
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe("/app/finance/reports?exportError=period");
    }
    expect(listAllEntries).not.toHaveBeenCalled();
  });

  it("reads the org of the session, never one from the URL", async () => {
    await call(`?month=2027-03&org_id=00000000-0000-4000-8000-000000000000&orgId=x`);
    expect(listAllEntries).toHaveBeenCalledWith(owner.supabase, ORG);
    expect(listCategories).toHaveBeenCalledWith(owner.supabase, ORG);
    expect(listReportUnits).toHaveBeenCalledWith(owner.supabase, ORG);
  });

  it("refuses to export a partial ledger", async () => {
    listAllEntries.mockResolvedValue({ entries: [], truncated: true });
    const res = await call("?year=2027");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("exportError=partial");
  });

  it("redirects with a generic code when the data cannot be added exactly", async () => {
    listAllEntries.mockResolvedValue({
      entries: [{ id: "x", kind: "income", categoryId: "c", occurredOn: "2027-03-02", amountCents: -1, currency: "PEN", fxRatePen: null, amountPenCents: -1, unitId: null, paymentMethod: "cash", counterparty: null, note: null, stayStart: null, stayEnd: null, channel: null, relatedEntryId: null, hasReceipt: false }],
      truncated: false,
    });
    const res = await call("?month=2027-03");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("exportError=invalid");
  });

  it("downloads an xlsx for the owner, never cached", async () => {
    const res = await call("?from=2027-03-01&to=2027-03-31");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="saywa-finanzas-2027-03-01_2027-03-31.xlsx"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
  });
});
