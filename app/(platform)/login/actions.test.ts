import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  demoMode: true,
  signIn: vi.fn(),
  createClient: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("@/lib/env", () => ({
  env: {
    get DEMO_MODE() {
      return mocks.demoMode ? "true" : undefined;
    },
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));

import { demoSignIn } from "./actions";

function form(intent = "demo") {
  const data = new FormData();
  data.set("intent", intent);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.demoMode = true;
  mocks.createClient.mockResolvedValue({ auth: { signInWithPassword: mocks.signIn } });
  mocks.signIn.mockResolvedValue({ error: null });
});

describe("demoSignIn", () => {
  it("signs in with the public demo staff account and redirects", async () => {
    await demoSignIn(undefined, form());
    expect(mocks.signIn).toHaveBeenCalledWith({
      email: "demo-staff@example.com",
      password: "demo-saywa-2026",
    });
    expect(mocks.redirect).toHaveBeenCalledWith("/app");
  });

  it("answers 404 before validation or Supabase work outside demo mode", async () => {
    mocks.demoMode = false;
    await expect(demoSignIn(undefined, form("forged"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("validates the action intent before signing in", async () => {
    expect(await demoSignIn(undefined, form("forged"))).toEqual({ error: true });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns only a generic flag when the provider fails", async () => {
    mocks.signIn.mockResolvedValue({ error: new Error("private auth detail") });
    const result = await demoSignIn(undefined, form());
    expect(result).toEqual({ error: true });
    expect(JSON.stringify(result)).not.toContain("private auth detail");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
