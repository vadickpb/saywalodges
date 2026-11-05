import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const allow = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => true));
vi.mock("@/lib/dal/public/rate-limit", () => ({ allowPublicRequest: allow }));
const mocks = vi.hoisted(() => ({ create: vi.fn(), host: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/dal/public/public-quote", () => ({ createPublicQuote: mocks.create }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => mocks.host() }) }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { mocks.redirect(to); throw new Error("NEXT_REDIRECT"); } }));
vi.mock("@/lib/dal/public/site", () => ({ siteIdentifierFromHost: (h: string) => h.split(".")[0] }));
import { submitPublicQuote } from "./actions";

const U = "ee204001-0000-4000-8000-000000000001";
const form = (o: Record<string, string> = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ unitId: U, checkIn: "2040-03-02", checkOut: "2040-03-05", guests: "2", ...o })) f.set(k, v);
  return f;
};
beforeEach(() => { vi.resetAllMocks(); mocks.host.mockReturnValue("saywa-lodges.localhost:3000"); });

describe("submitPublicQuote", () => {
  it("prices nothing itself: validates, passes the host from the REQUEST, and sends the guest to the checkout", async () => {
    mocks.create.mockResolvedValue({ ok: true, token: "c".repeat(64) });
    await expect(submitPublicQuote("es", {}, form({ host: "evil", totalCents: "1" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.create).toHaveBeenCalledWith("saywa-lodges", { unitId: U, checkIn: "2040-03-02", checkOut: "2040-03-05", guests: 2, lang: "es" });
    expect(mocks.redirect).toHaveBeenCalledWith(`/es/reservar/${"c".repeat(64)}`);
  });
  it("marks the invalid fields and never calls the database", async () => {
    const r = await submitPublicQuote("es", {}, form({ guests: "0", checkOut: "2040-03-01" }));
    expect(r).toEqual({ error: "validation", fields: { guests: true, checkOut: true } });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("answers tryLater and never reaches the database when the caller is rate limited", async () => {
    allow.mockResolvedValueOnce(false);
    const form = new FormData();
    form.set("unitId", "ee204001-0000-4000-8000-000000000001"); form.set("checkIn", "2040-03-02"); form.set("checkOut", "2040-03-05"); form.set("guests", "2");
    expect(await submitPublicQuote("es", {}, form)).toEqual({ error: "tryLater" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("refuses an unknown language", async () => {
    expect(await submitPublicQuote("fr", {}, form())).toEqual({ error: "generic" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("returns the refusal with its numbers so the screen can explain it", async () => {
    mocks.create.mockResolvedValue({ ok: false, error: "minNights", requiredNights: 3 });
    expect(await submitPublicQuote("en", {}, form())).toEqual({ error: "minNights", requiredNights: 3, maxGuests: undefined });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("hides anything thrown", async () => {
    mocks.create.mockRejectedValue(new Error("postgres://user:pw@host"));
    const r = await submitPublicQuote("es", {}, form());
    expect(r).toEqual({ error: "generic" });
    expect(JSON.stringify(r)).not.toContain("postgres://");
  });
});
