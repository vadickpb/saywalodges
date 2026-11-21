import { describe, expect, it, vi } from "vitest";
import { createAutosave, type AutosaveStatus, type SaveResult } from "./autosave";

const deferred = <T>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };
function setup(send: (v: string) => Promise<SaveResult>) {
  const statuses: AutosaveStatus["state"][] = [];
  const a = createAutosave({ initial: "", send, onStatus: (s) => statuses.push(s.state) });
  return { a, statuses };
}

describe("createAutosave", () => {
  it("sends the latest value and reports saved", async () => {
    const send = vi.fn(async () => ({ ok: true as const }));
    const { a, statuses } = setup(send);
    a.set("Ana");
    await a.flush();
    expect(send).toHaveBeenCalledWith("Ana");
    expect(statuses).toEqual(["saving", "saved"]);
    expect(a.dirty).toBe(false);
  });
  it("does nothing when nothing changed, and two flushes never overlap", async () => {
    const gate = deferred<SaveResult>();
    const send = vi.fn(() => gate.promise);
    const { a } = setup(send);
    await a.flush();
    expect(send).not.toHaveBeenCalled();
    a.set("Ana");
    const first = a.flush();
    const second = a.flush();
    gate.resolve({ ok: true });
    await Promise.all([first, second]);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("an edit made while a save is in flight is sent next, and 'saved' is only reported at the end (the reviewed data-loss bug)", async () => {
    const gate = deferred<SaveResult>();
    const send = vi.fn().mockReturnValueOnce(gate.promise).mockResolvedValueOnce({ ok: true });
    const { a, statuses } = setup(send);
    a.set("cuna");
    const running = a.flush();
    a.set("cuna + nombre"); // typed while the first save is in flight, no blur yet
    gate.resolve({ ok: true });
    await running;
    expect(send.mock.calls).toEqual([["cuna"], ["cuna + nombre"]]);
    expect(statuses.filter((s) => s === "saved")).toHaveLength(1);
    expect(statuses.at(-1)).toBe("saved");
    expect(a.dirty).toBe(false);
  });
  it("a failed save stays dirty and the next flush retries the latest value", async () => {
    const send = vi.fn().mockResolvedValueOnce({ ok: false, error: "No se pudo guardar." }).mockResolvedValueOnce({ ok: true });
    const { a, statuses } = setup(send);
    a.set("Ana");
    await a.flush();
    expect(statuses.at(-1)).toBe("error");
    expect(a.dirty).toBe(true);
    a.set("Ana M");
    await a.flush();
    expect(send).toHaveBeenLastCalledWith("Ana M");
    expect(statuses.at(-1)).toBe("saved");
  });
  it("a thrown error (offline) is an error status, not a crash, and keeps the value", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ok: true });
    const { a, statuses } = setup(send);
    a.set("Ana");
    await a.flush();
    expect(statuses.at(-1)).toBe("error");
    await a.flush();
    expect(statuses.at(-1)).toBe("saved");
  });
  it("passes field errors through for the form to show", async () => {
    const seen: AutosaveStatus[] = [];
    const a = createAutosave({ initial: "", send: async () => ({ ok: false as const, error: "Revisa", fields: { arrival: ["Usa HH:MM"] } }), onStatus: (s) => seen.push(s) });
    a.set("x");
    await a.flush();
    expect(seen.at(-1)).toMatchObject({ state: "error", fields: { arrival: ["Usa HH:MM"] } });
  });
});
