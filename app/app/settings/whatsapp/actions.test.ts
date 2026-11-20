import { beforeEach, describe, expect, it, vi } from "vitest";
const save = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/dal/whatsapp-rules", () => {
  class NotOwnerError extends Error {}
  return { saveWhatsappRule: save, NotOwnerError };
});
import { whatsappRuleAction } from "./actions";
import { NotOwnerError } from "@/lib/dal/whatsapp-rules";

const form = (patch: Record<string, string> = {}) => {
  const data = new FormData();
  for (const [k, v] of Object.entries({ kind: "arrival_reminder", enabled: "on", offsetDays: "1", windowStart: "9", windowEnd: "20", ...patch })) data.set(k, v);
  return data;
};
beforeEach(() => { vi.clearAllMocks(); save.mockResolvedValue(undefined); });

describe("whatsapp rule action", () => {
  it("saves a valid rule (an unticked box means off)", async () => {
    const data = form(); data.delete("enabled");
    expect((await whatsappRuleAction({ ok: false }, data)).ok).toBe(true);
    expect(save).toHaveBeenCalledWith({ kind: "arrival_reminder", enabled: false, offsetDays: 1, windowStart: 9, windowEnd: 20 });
  });
  it("rejects invalid input without saving, with field errors", async () => {
    const result = await whatsappRuleAction({ ok: false }, form({ windowStart: "20", windowEnd: "9" }));
    expect(result).toMatchObject({ ok: false, formError: expect.any(String), errors: { windowEnd: expect.any(Array) } });
    expect(save).not.toHaveBeenCalled();
  });
  it("turns failures into generic messages", async () => {
    save.mockRejectedValue(new NotOwnerError("Solo el dueño"));
    expect(await whatsappRuleAction({ ok: false }, form())).toEqual({ ok: false, formError: "Solo el dueño" });
    save.mockRejectedValue(new Error("relation secret"));
    expect((await whatsappRuleAction({ ok: false }, form())).formError).not.toContain("secret");
  });
});
