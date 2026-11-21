import { describe, expect, it, vi } from "vitest";
import { finishWithFallback } from "./ical-finish";

const plain = { uid: "a".repeat(64), start: "2030-01-01", end: "2030-01-03" };
const rich = { ...plain, code: "HMABC12345", last4: "7788" };

describe("finishWithFallback (SD-1129 expand/contract)", () => {
  it("sends the hints when the database accepts them", async () => {
    const finish = vi.fn(async () => ({ error: null, data: true }));
    await finishWithFallback(finish, [rich]);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledWith([rich]);
  });
  it("retries once with only uid/start/end when an older database rejects the extra keys (22023)", async () => {
    const finish = vi.fn()
      .mockResolvedValueOnce({ error: { code: "22023" }, data: null })
      .mockResolvedValueOnce({ error: null, data: true });
    const result = await finishWithFallback(finish, [rich]);
    expect(result).toEqual({ error: null, data: true });
    expect(finish).toHaveBeenNthCalledWith(2, [plain]);
  });
  it("does not retry when there was nothing extra to drop, or for other errors", async () => {
    const same = vi.fn(async () => ({ error: { code: "22023" } }));
    await finishWithFallback(same, [plain]);
    expect(same).toHaveBeenCalledTimes(1);
    const other = vi.fn(async () => ({ error: { code: "42501" } }));
    await finishWithFallback(other, [rich]);
    expect(other).toHaveBeenCalledTimes(1);
  });
});
