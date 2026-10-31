import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal/organizations", () => ({ requireActiveOrg: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/dal/property", () => ({ updateSiteAppearance: vi.fn() }));
import { revalidatePath } from "next/cache";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { updateSiteAppearance } from "@/lib/dal/property";
import { createClient } from "@/lib/supabase/server";
import { saveAppearance } from "./actions";

const pair = (es: string, en: string) => ({ es, en });
function form(payload: unknown, extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("payload", typeof payload === "string" ? payload : JSON.stringify(payload));
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}
const valid = { theme: { preset: "costa", accent: "#112233" }, content: { headline: pair("Hola", "Hi") } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireActiveOrg).mockResolvedValue({
    activeOrg: { id: "session-org", role: "owner" },
  } as Awaited<ReturnType<typeof requireActiveOrg>>);
  vi.mocked(createClient).mockResolvedValue({} as Awaited<ReturnType<typeof createClient>>);
  vi.mocked(updateSiteAppearance).mockResolvedValue({ ok: true });
});

describe("saveAppearance", () => {
  it("refuses without an active org, before creating a client", async () => {
    vi.mocked(requireActiveOrg).mockResolvedValue({ activeOrg: null } as Awaited<ReturnType<typeof requireActiveOrg>>);
    expect((await saveAppearance({ ok: false }, form(valid))).ok).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
    expect(updateSiteAppearance).not.toHaveBeenCalled();
  });

  it("takes the org only from the session, ignoring any org/property id in the form", async () => {
    const result = await saveAppearance({ ok: false }, form(valid, { orgId: "attacker", propertyId: "x" }));
    expect(result.ok).toBe(true);
    expect(updateSiteAppearance).toHaveBeenCalledWith(
      expect.anything(),
      "session-org",
      expect.objectContaining({ theme: { preset: "costa", accent: "#112233" } })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/app/site/appearance");
  });

  it("rejects an invalid draft with the failing paths and never writes", async () => {
    const result = await saveAppearance({ ok: false }, form({ theme: { primary: "red" }, content: {} }));
    expect(result).toMatchObject({ ok: false, paths: ["theme.primary"] });
    expect(updateSiteAppearance).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects a missing or non-JSON payload", async () => {
    expect((await saveAppearance({ ok: false }, new FormData())).ok).toBe(false);
    expect((await saveAppearance({ ok: false }, form("{broken"))).ok).toBe(false);
    expect(updateSiteAppearance).not.toHaveBeenCalled();
  });

  it("returns a generic error when the DAL write fails", async () => {
    vi.mocked(updateSiteAppearance).mockResolvedValue({ ok: false });
    const result = await saveAppearance({ ok: false }, form(valid));
    expect(result).toEqual({ ok: false, formError: "No se pudo guardar. Intenta de nuevo." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
