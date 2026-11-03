import { describe, expect, it } from "vitest";
import { SUPABASE_CLI, environmentConflict, isLocalUrl, localEnvVars, mergeEnvFile, parseStatusEnv } from "./local-env.mjs";

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
    expect(r.conflict).toMatch(/not a local URL/);
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

describe("mergeEnvFile: hard cases (the guard must not be bypassable by formatting)", () => {
  const remote = "https://abcdefghijklmnopqrst.supabase.co";
  it("checks EVERY definition: a hosted URL after a local one still blocks (the last one used to win)", () => {
    const r = mergeEnvFile(`SUPABASE_URL=http://127.0.0.1:54321\nSUPABASE_URL=${remote}\n`, vars);
    expect(r.conflict).toMatch(/not a local URL/);
    expect(r.changed).toBe(false);
  });
  it.each([
    [`export SUPABASE_URL=${remote}`],
    [`SUPABASE_URL = ${remote}`],
    [`  export   NEXT_PUBLIC_SUPABASE_URL =  "${remote}"`],
    [`SUPABASE_URL='${remote}'`],
    [`SUPABASE_URL=${remote} # production`],
  ])("recognises a hosted URL written as %s", (line) => {
    expect(mergeEnvFile(`${line}\n`, vars).conflict).toMatch(/not a local URL/);
  });
  it("treats an unreadable URL as a conflict instead of crashing", () => {
    for (const bad of ["SUPABASE_URL=notaurl", "SUPABASE_URL=127.0.0.1:54321", "NEXT_PUBLIC_SUPABASE_URL=//host"]) {
      expect(mergeEnvFile(`${bad}\n`, vars).conflict).toMatch(/unreadable value/);
    }
  });
  it("accepts a local URL written with export, spaces, quotes or an inline comment, and normalises it", () => {
    for (const line of ['export SUPABASE_URL = "http://127.0.0.1:54321"', "SUPABASE_URL=http://localhost:54321 # local"]) {
      const r = mergeEnvFile(`${line}\n`, vars);
      expect(r.conflict).toBeNull();
      expect(r.content.match(/^SUPABASE_URL=/gm)).toHaveLength(1);
      expect(r.content).toContain("SUPABASE_URL=http://127.0.0.1:54321\n");
    }
  });
  it("ignores commented-out lines and never treats a comment as a definition", () => {
    const r = mergeEnvFile(`# SUPABASE_URL=${remote}\n#export SUPABASE_URL=${remote}\n`, vars);
    expect(r.conflict).toBeNull();
    expect(r.content).toContain(`# SUPABASE_URL=${remote}\n`);
  });
  it("keeps CRLF files CRLF and reports no change on a second run", () => {
    const first = mergeEnvFile("A=1\r\nROOT_DOMAIN=localhost:3000\r\n", vars);
    expect(first.content).not.toMatch(/[^\r]\n/);
    expect(first.content.startsWith("A=1\r\nROOT_DOMAIN=localhost:3000\r\n")).toBe(true);
    const second = mergeEnvFile(first.content, vars);
    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });
});

describe("parseStatusEnv: real output of the pinned CLI", () => {
  it("ignores the other lines `supabase status -o env` prints", () => {
    const real = [
      'ANON_KEY="a.b.c"', 'API_URL="http://127.0.0.1:54321"', 'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
      'GRAPHQL_URL="http://127.0.0.1:54321/graphql/v1"', 'INBUCKET_URL="http://127.0.0.1:54324"', 'JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"',
      'MCP_URL="http://127.0.0.1:54321/mcp"', 'S3_PROTOCOL_ACCESS_KEY_ID="x"', 'SERVICE_ROLE_KEY="s.e.r"', 'STORAGE_S3_URL="http://127.0.0.1:54321/storage/v1/s3"', 'STUDIO_URL="http://127.0.0.1:54323"',
    ].join("\n");
    expect(parseStatusEnv(real)).toEqual({ apiUrl: "http://127.0.0.1:54321", anonKey: "a.b.c", serviceRoleKey: "s.e.r" });
  });
});

describe("real credentials without a URL, and the process environment", () => {
  it("does not overwrite a service-role key that is not the local one when there is no local URL beside it", () => {
    const r = mergeEnvFile("SUPABASE_SERVICE_ROLE_KEY=eyJ.real.prod\n", vars);
    expect(r.conflict).toMatch(/may be a real credential/);
    expect(r.content).toBe("SUPABASE_SERVICE_ROLE_KEY=eyJ.real.prod\n");
  });
  it("still refreshes stale LOCAL keys when the local URL is there (the stack was recreated)", () => {
    const r = mergeEnvFile("SUPABASE_URL=http://127.0.0.1:54321\nSUPABASE_SERVICE_ROLE_KEY=old.local\n", vars);
    expect(r.conflict).toBeNull();
    expect(r.content).toContain("SUPABASE_SERVICE_ROLE_KEY=service.jwt.value");
  });
  it("environmentConflict flags a hosted URL exported in the shell, which beats every .env file", () => {
    expect(environmentConflict({ SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" })).toMatch(/SUPABASE_URL .*variable de entorno/);
    expect(environmentConflict({ NEXT_PUBLIC_SUPABASE_URL: "not a url" })).toMatch(/valor ilegible/);
  });
  it("environmentConflict allows an empty, missing or local value", () => {
    expect(environmentConflict({})).toBeNull();
    expect(environmentConflict({ SUPABASE_URL: "" })).toBeNull();
    expect(environmentConflict({ SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" })).toBeNull();
  });
});
