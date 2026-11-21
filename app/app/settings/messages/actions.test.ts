import { beforeEach, describe, expect, it, vi } from "vitest";
const dal = vi.hoisted(() => ({ saveTemplate: vi.fn(), resetTemplate: vi.fn(), saveHouseInfo: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/dal/message-templates", () => {
  class NotOwnerError extends Error {}
  return { ...dal, NotOwnerError };
});
import { resetTemplateAction, saveHouseInfoAction, saveTemplateAction } from "./actions";
import { NotOwnerError } from "@/lib/dal/message-templates";

const tpl = { key: "welcome", title: "Bienvenida", bodyEs: "{saludo}", bodyEn: "{saludo}", anchor: "", offsetDays: "" };
beforeEach(() => { vi.clearAllMocks(); dal.saveTemplate.mockResolvedValue(undefined); dal.resetTemplate.mockResolvedValue(undefined); dal.saveHouseInfo.mockResolvedValue(undefined); });

describe("message library actions", () => {
  it("saves valid input", async () => {
    expect(await saveTemplateAction(tpl)).toEqual({ ok: true });
    expect(dal.saveTemplate).toHaveBeenCalledWith(expect.objectContaining({ key: "welcome", anchor: null, offsetDays: null }));
    expect(await saveHouseInfoAction({ checkinTime: "14:00" })).toEqual({ ok: true });
    expect(await resetTemplateAction("welcome")).toEqual({ ok: true });
  });
  it("returns field errors for a typo'd variable or a bad link, without saving", async () => {
    const bad = await saveTemplateAction({ ...tpl, bodyEs: "Hola {nombrre}" });
    expect(bad).toMatchObject({ ok: false, fields: { bodyEs: [expect.stringContaining("nombrre")] } });
    const house = await saveHouseInfoAction({ locationUrl: "http://x.pe" });
    expect(house).toMatchObject({ ok: false, fields: { locationUrl: expect.any(Array) } });
    expect(dal.saveTemplate).not.toHaveBeenCalled();
    expect(dal.saveHouseInfo).not.toHaveBeenCalled();
  });
  it("turns failures into messages that leak nothing", async () => {
    dal.saveTemplate.mockRejectedValue(new NotOwnerError("Solo el dueño puede cambiar los mensajes."));
    expect(await saveTemplateAction(tpl)).toEqual({ ok: false, error: "Solo el dueño puede cambiar los mensajes." });
    dal.saveHouseInfo.mockRejectedValue(new Error("relation secret"));
    expect((await saveHouseInfoAction({})).ok).toBe(false);
    expect(JSON.stringify(await saveHouseInfoAction({}))).not.toContain("secret");
  });
});
