import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/anon", () => ({ getSupabaseAnon: () => ({ rpc }) }));
import { createPublicQuote } from "./public-quote";

const input = { unitId: "ee204001-0000-4000-8000-000000000001", checkIn: "2040-03-02", checkOut: "2040-03-05", guests: 2, lang: "es" as const };
beforeEach(() => rpc.mockReset());

describe("createPublicQuote", () => {
  it("sends only host, unit, dates and guests: no amount of any kind", async () => {
    rpc.mockResolvedValue({ data: { ok: true, token: "b".repeat(64), expires_at: "x", currency: "USD", total_cents: 1, deposit_cents: 1, nights: 3 }, error: null });
    expect(await createPublicQuote("saywa-lodges", input)).toEqual({ ok: true, token: "b".repeat(64) });
    expect(rpc).toHaveBeenCalledWith("create_public_quote", { p_host: "saywa-lodges", p_unit_id: input.unitId, p_check_in: "2040-03-02", p_check_out: "2040-03-05", p_guests: 2 });
  });
  it("turns business refusals into screen errors with their numbers", async () => {
    rpc.mockResolvedValue({ data: { ok: false, error: "MIN_NIGHTS", requiredNights: 2 }, error: null });
    expect(await createPublicQuote("h", input)).toEqual({ ok: false, error: "minNights", requiredNights: 2 });
    rpc.mockResolvedValue({ data: { ok: false, error: "CAPACITY_EXCEEDED", maxGuests: 6 }, error: null });
    expect(await createPublicQuote("h", input)).toEqual({ ok: false, error: "capacity", maxGuests: 6 });
  });
  it("maps the abuse cap (54000) and never exposes the database message", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "54000", message: "too many quotes for org 123" } });
    const r = await createPublicQuote("h", input);
    expect(r).toEqual({ ok: false, error: "tryLater" });
    expect(JSON.stringify(r)).not.toContain("org 123");
  });
  it("a malformed answer is generic, not trusted", async () => {
    rpc.mockResolvedValue({ data: { ok: true, token: "../etc/passwd" }, error: null });
    expect(await createPublicQuote("h", input)).toEqual({ ok: false, error: "generic" });
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await createPublicQuote("h", input)).toEqual({ ok: false, error: "generic" });
  });
  it("refuses an empty or absurd host without calling the database", async () => {
    expect(await createPublicQuote("", input)).toEqual({ ok: false, error: "unitNotFound" });
    expect(await createPublicQuote("a".repeat(300), input)).toEqual({ ok: false, error: "unitNotFound" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
