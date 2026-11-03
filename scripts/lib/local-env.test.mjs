import { describe, expect, it } from "vitest";
import { SUPABASE_CLI, isLocalUrl, localEnvVars, mergeEnvFile, parseStatusEnv } from "./local-env.mjs";

const status = `API_URL="http://127.0.0.1:54321"\nANON_KEY="anon.jwt.value"\nDB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"\nSERVICE_ROLE_KEY="service.jwt.value"\n`;
const vars = localEnvVars(parseStatusEnv(status));

describe("parseStatusEnv", () => {
  it("reads the three values from `supabase status -o env`", () => {
    expect(parseStatusEnv(status)).toEqual({ apiUrl: "http://127.0.0.1:54321", anonKey: "anon.jwt.value", serviceRoleKey: "service.jwt.value" });
  });
  it("returns null when the stack is not running or the output is incomplete", () => {
    expect(parseStatusEnv("")).toBeNull();
    expect(parseStatusEnv('API_URL="http://127.0.0.1:54321"')).toBeNull();
    expect(parseStatusEnv("failed to inspect container health")).toBeNull();
  });
  it("accepts unquoted values and CRLF", () => {
    expect(parseStatusEnv("API_URL=http://localhost:54321\r\nANON_KEY=a\r\nSERVICE_ROLE_KEY=s\r\n")?.apiUrl).toBe("http://localhost:54321");
  });
});

describe("isLocalUrl", () => {
  it("is true only for loopback hosts", () => {
    expect(isLocalUrl("http://127.0.0.1:54321")).toBe(true);
    expect(isLocalUrl("http://localhost:54321")).toBe(true);
    expect(isLocalUrl("https://abcdefghijklmnopqrst.supabase.co")).toBe(false);
    expect(isLocalUrl("http://127.0.0.1.evil.com")).toBe(false);
    expect(isLocalUrl("not a url")).toBe(false);
    expect(isLocalUrl("")).toBe(false);
  });
});

describe("mergeEnvFile", () => {
  it("creates the four variables in an empty file", () => {
    const r = mergeEnvFile("", vars);
    expect(r.changed).toBe(true);
    expect(r.content).toBe("SUPABASE_URL=http://127.0.0.1:54321\nNEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nNEXT_PUBLIC_SUPABASE_ANON_KEY=anon.jwt.value\nSUPABASE_SERVICE_ROLE_KEY=service.jwt.value\n");
  });
  it("fills the blank variables of a copied template and keeps everything else untouched", () => {
    const tpl = "# comment\nNEXT_PUBLIC_SITE_URL=https://saywalodges.com\nSUPABASE_URL=\nSUPABASE_SERVICE_ROLE_KEY=\nNEXT_PUBLIC_SUPABASE_URL=\nNEXT_PUBLIC_SUPABASE_ANON_KEY=\nROOT_DOMAIN=localhost:3000\nCRON_SECRET=keepme\n";
    const r = mergeEnvFile(tpl, vars);
    expect(r.conflict).toBeNull();
    expect(r.content).toContain("# comment\nNEXT_PUBLIC_SITE_URL=https://saywalodges.com\n");
    expect(r.content).toContain("SUPABASE_URL=http://127.0.0.1:54321\n");
    expect(r.content).toContain("ROOT_DOMAIN=localhost:3000\nCRON_SECRET=keepme\n");
    expect(r.content.match(/SUPABASE_URL=/g)).toHaveLength(2); // SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL
  });
  it("is idempotent: a second run changes nothing", () => {
    const once = mergeEnvFile("A=1\n", vars);
    const twice = mergeEnvFile(once.content, vars);
    expect(twice.changed).toBe(false);
    expect(twice.content).toBe(once.content);
  });
  it("collapses duplicate definitions (e.g. lines appended by hand) into one", () => {
    const r = mergeEnvFile("SUPABASE_URL=\nSUPABASE_URL=http://127.0.0.1:54321\nSUPABASE_URL=http://127.0.0.1:54321\n", vars);
    expect(r.content.match(/^SUPABASE_URL=/gm)).toHaveLength(1);
  });
  it("updates stale local keys (the stack was recreated)", () => {
    const r = mergeEnvFile("NEXT_PUBLIC_SUPABASE_ANON_KEY=old\nSUPABASE_URL=http://127.0.0.1:54321\n", vars);
    expect(r.content).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY=anon.jwt.value");
    expect(r.changed).toBe(true);
  });
  it("REFUSES to touch a file that points to a hosted project, and reports why", () => {
    const hosted = "SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=real-secret\n";
    const r = mergeEnvFile(hosted, vars);
    expect(r.conflict).toMatch(/non-local project/);
    expect(r.content).toBe(hosted);
    expect(r.changed).toBe(false);
    const viaPublic = mergeEnvFile('NEXT_PUBLIC_SUPABASE_URL="https://abcdefghijklmnopqrst.supabase.co"\n', vars);
    expect(viaPublic.conflict).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});

describe("pinned CLI", () => {
  it("is an exact version, never `latest`", () => {
    expect(SUPABASE_CLI).toMatch(/^supabase@\d+\.\d+\.\d+$/);
  });
});
