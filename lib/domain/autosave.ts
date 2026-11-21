// Autosave engine (SD-1129). Pure: no React, no timers. The stay card feeds it every edit and asks it to flush; it guarantees that
//  * what is sent is always the latest value, and a "saved" is only reported for a value that was actually sent;
//  * an edit made while a save is in flight is sent as soon as that save ends (never dropped, never reported saved early);
//  * a failed save keeps the value dirty, so the next flush retries it;
//  * two flushes never run at once.

export type SaveResult = { ok: true } | { ok: false; error: string; fields?: Record<string, string[]> };
export type AutosaveStatus = { state: "idle" | "saving" | "saved" | "error"; message?: string; fields?: Record<string, string[]> };

export function createAutosave<T>(options: { initial: T; send: (value: T) => Promise<SaveResult>; onStatus: (status: AutosaveStatus) => void }) {
  let latest = options.initial;
  let dirty = false;
  let saving = false;

  async function flush(): Promise<void> {
    if (!dirty || saving) return;
    saving = true;
    const sent = latest;
    options.onStatus({ state: "saving" });
    let ok = false;
    try {
      const result = await options.send(sent);
      if (result.ok) ok = true;
      else options.onStatus({ state: "error", message: result.error, fields: result.fields });
    } catch {
      options.onStatus({ state: "error", message: "Sin conexión. Se reintentará al volver a editar." });
    }
    saving = false;
    if (!ok) return;
    if (latest === sent) {
      dirty = false;
      options.onStatus({ state: "saved" });
    } else {
      await flush();
    }
  }

  return {
    /** Records the new value; the caller decides when to flush (on blur, or right away for taps). */
    set(value: T) { latest = value; dirty = true; },
    get value() { return latest; },
    get dirty() { return dirty; },
    flush,
  };
}
