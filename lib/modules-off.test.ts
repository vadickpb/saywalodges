import { beforeEach, describe, expect, it, vi } from "vitest";

// SD-1103: with a module off, its entry points run nothing. Every dependency that would touch data is a spy that must stay unused.
const spies = vi.hoisted(() => ({ requireActiveOrg: vi.fn(), recordWhatsappStatus: vi.fn(), saveGuide: vi.fn(), unlockGuide: vi.fn(), ownerGuideImage: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/modules", () => ({
  moduleEnabled: () => false,
  requireModule: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/dal/organizations", () => ({ requireActiveOrg: spies.requireActiveOrg }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/dal/whatsapp", () => ({ recordWhatsappStatus: spies.recordWhatsappStatus }));
vi.mock("@/lib/dal/guest-guide", () => ({
  saveGuide: spies.saveGuide,
  createGuideLink: vi.fn(),
  revokeGuideLink: vi.fn(),
  uploadGuideImage: vi.fn(),
  unlockGuide: spies.unlockGuide,
  guideCookieName: () => "c",
  ownerGuideImage: spies.ownerGuideImage,
  visitorGuideImage: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe("modules switched off", () => {
  it("finance: no context, so no page, action or route can read the ledger", async () => {
    const { getFinanceContext } = await import("@/app/app/finance/_lib/context");
    expect(await getFinanceContext()).toBeNull();
    expect(spies.requireActiveOrg).not.toHaveBeenCalled();
  });

  it("whatsapp: webhook answers 404 and stores nothing", async () => {
    const { GET, POST } = await import("@/app/api/whatsapp/webhook/route");
    expect((await GET(new Request("http://x/api/whatsapp/webhook?hub.mode=subscribe"))).status).toBe(404);
    expect((await POST(new Request("http://x/api/whatsapp/webhook", { method: "POST", body: "{}" }))).status).toBe(404);
    expect(spies.recordWhatsappStatus).not.toHaveBeenCalled();
  });

  it("guide: owner and visitor actions throw not-found before touching data", async () => {
    const owner = await import("@/app/app/site/guide/actions");
    await expect(owner.saveGuideAction({}, 0, false)).rejects.toThrow("NEXT_NOT_FOUND");
    const visitor = await import("@/app/sites/[host]/[lang]/guia/[token]/actions");
    await expect(visitor.unlockGuideAction("h", "es", "t", { error: "" }, new FormData())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(spies.saveGuide).not.toHaveBeenCalled();
    expect(spies.unlockGuide).not.toHaveBeenCalled();
  });

  it("guide: image route answers 404", async () => {
    const { GET } = await import("@/app/app/site/guide/images/[id]/route");
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(404);
    expect(spies.ownerGuideImage).not.toHaveBeenCalled();
  });
});
