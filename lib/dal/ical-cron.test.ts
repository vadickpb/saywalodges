import { beforeEach, describe, expect, it, vi } from "vitest";
import type { getSupabaseAdmin } from "@/lib/supabase/admin";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("./ical-sync", () => ({ downloadSnapshot: vi.fn() }));
import { downloadSnapshot } from "./ical-sync";
import { claimAlert, listDueFeedIds, settleAlert, syncDueFeed } from "./ical-cron";

type Admin = ReturnType<typeof getSupabaseAdmin>;
const feed = "f3050000-0000-4000-8000-000000000001";
const token = "f3050000-0000-4000-8000-000000000002";
const uid = "a".repeat(64);
const events = [{ uid, start: "2031-01-01", end: "2031-01-02" }];
const rpc = vi.fn();
const client = { rpc } as unknown as Admin;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(downloadSnapshot).mockResolvedValue({ events });
});

describe("syncDueFeed", () => {
  it("runs begin → download → finish through the cron RPCs without any org argument", async () => {
    rpc.mockResolvedValueOnce({ data: { token, url: "https://www.airbnb.com/x" }, error: null }).mockResolvedValueOnce({ data: true, error: null });
    expect(await syncDueFeed(feed, client)).toBe("synced");
    expect(rpc).toHaveBeenNthCalledWith(1, "cron_begin_ical_sync", { p_feed_id: feed });
    expect(rpc).toHaveBeenNthCalledWith(2, "cron_finish_ical_sync", { p_feed_id: feed, p_token: token, p_events: events });
    expect(downloadSnapshot).toHaveBeenCalledWith("https://www.airbnb.com/x");
  });

  it("skips (and never downloads) when the lease is held elsewhere", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await syncDueFeed(feed, client)).toBe("skipped");
    expect(downloadSnapshot).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("records a safe error code and reports failure when the download is rejected (SSRF guard, size, format)", async () => {
    vi.mocked(downloadSnapshot).mockResolvedValue({ events: [], code: "URL" });
    rpc.mockResolvedValueOnce({ data: { token, url: "https://evil.example/x" }, error: null }).mockResolvedValueOnce({ data: true, error: null });
    expect(await syncDueFeed(feed, client)).toBe("failed");
    expect(rpc).toHaveBeenNthCalledWith(2, "cron_finish_ical_sync", { p_feed_id: feed, p_token: token, p_events: [], p_error: "URL" });
  });

  it("treats a stale completion (false) as skipped, not as a success", async () => {
    rpc.mockResolvedValueOnce({ data: { token, url: "https://www.airbnb.com/x" }, error: null }).mockResolvedValueOnce({ data: false, error: null });
    expect(await syncDueFeed(feed, client)).toBe("skipped");
  });

  it("never throws: RPC errors, bad shapes and thrown errors become `failed` without leaking text", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "secret detail" } });
    expect(await syncDueFeed(feed, client)).toBe("failed");
    rpc.mockResolvedValueOnce({ data: { token: "not-a-uuid", url: "x" }, error: null });
    expect(await syncDueFeed(feed, client)).toBe("failed");
    rpc.mockRejectedValueOnce(new Error("network secret"));
    expect(await syncDueFeed(feed, client)).toBe("failed");
    expect([...spy.mock.calls, ...err.mock.calls].flat().join(" ")).not.toContain("secret");
    spy.mockRestore();
    err.mockRestore();
  });
});

describe("listDueFeedIds", () => {
  it("returns only feed ids and passes the limit", async () => {
    rpc.mockResolvedValueOnce({ data: [{ feed_id: feed }], error: null });
    expect(await listDueFeedIds(25, client)).toEqual([feed]);
    expect(rpc).toHaveBeenCalledWith("cron_list_due_ical_feeds", { p_limit: 25 });
  });
  it("throws a generic error on RPC failure", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "secret detail" } });
    await expect(listDueFeedIds(5, client)).rejects.toThrow("ical list failed");
    err.mockRestore();
  });
});

describe("alerts", () => {
  const claim = { claim_id: token, channel: "booking", unit_name: null, count: 1, recipients: ["owner@example.com"] };
  it("parses a claim and returns null when there is nothing new", async () => {
    rpc.mockResolvedValueOnce({ data: claim, error: null });
    expect(await claimAlert(feed, "conflict", client)).toEqual(claim);
    expect(rpc).toHaveBeenCalledWith("cron_claim_ical_alert", { p_feed_id: feed, p_kind: "conflict" });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await claimAlert(feed, "feed_down", client)).toBeNull();
  });
  it("rejects a malformed claim instead of mailing it", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: { ...claim, recipients: ["not an email"] }, error: null });
    expect(await claimAlert(feed, "conflict", client)).toBeNull();
    err.mockRestore();
  });
  it("settles by claim id", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await settleAlert(feed, token, true, client);
    expect(rpc).toHaveBeenCalledWith("cron_settle_ical_alert", { p_feed_id: feed, p_claim_id: token, p_delivered: true });
  });
});
