// Pure helpers of the one-command local setup (scripts/local.mjs). No I/O, so they are unit-tested.
// Rule that matters: this tooling only ever points a development environment at the LOCAL Supabase stack,
// never at a hosted project ("never point a development environment at production", README).

// Same version as CI and the production deploy. `npx supabase` without a version resolves to the latest release, which can
// lack a binary for this machine (v3.0.0 had none for macOS arm64), so every command here pins it.
export const SUPABASE_CLI = "supabase@2.122.0";

/** `supabase status -o env` prints KEY="value" lines. Returns the three values the app needs, or null if any is missing. */
export function parseStatusEnv(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const m = /^([A-Z_]+)="?(.*?)"?\s*$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  const { API_URL, ANON_KEY, SERVICE_ROLE_KEY } = out;
  return API_URL && ANON_KEY && SERVICE_ROLE_KEY ? { apiUrl: API_URL, anonKey: ANON_KEY, serviceRoleKey: SERVICE_ROLE_KEY } : null;
}

export function isLocalUrl(value) {
  try {
    const u = new URL(value);
    return (u.hostname === "127.0.0.1" || u.hostname === "localhost") && (u.protocol === "http:" || u.protocol === "https:");
  } catch {
    return false;
  }
}

const KEYS = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];

/** The four variables the app validates at start-up (lib/env.ts), from the local stack. */
export function localEnvVars({ apiUrl, anonKey, serviceRoleKey }) {
  return { SUPABASE_URL: apiUrl, NEXT_PUBLIC_SUPABASE_URL: apiUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey };
}

const valueOf = (line) => line.slice(line.indexOf("=") + 1).trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");

/**
 * Updates ONLY those four variables inside an existing .env.local, keeping every other line (comments, other settings, order).
 * Refuses (conflict) when a Supabase URL already there points to a hosted project, so a real project is never overwritten
 * or silently mixed with the local keys.
 * @returns {{ content: string, changed: boolean, conflict: string | null }}
 */
export function mergeEnvFile(existing, vars) {
  const lines = existing === "" ? [] : existing.replace(/\n$/, "").split("\n");
  for (const key of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
    const line = lines.find((l) => l.startsWith(`${key}=`) && valueOf(l) !== "");
    if (line && !isLocalUrl(valueOf(line))) {
      return { content: existing, changed: false, conflict: `${key} already points to a non-local project (${new URL(valueOf(line)).host}). Remove it by hand if you really want the local stack.` };
    }
  }
  let changed = false;
  const seen = new Set();
  const next = [];
  for (const line of lines) {
    const key = KEYS.find((k) => line.startsWith(`${k}=`));
    if (!key) {
      next.push(line);
      continue;
    }
    if (seen.has(key)) {
      changed = true; // a duplicate definition is dropped: the last one used to win, now there is exactly one
      continue;
    }
    seen.add(key);
    const wanted = `${key}=${vars[key]}`;
    if (valueOf(line) !== vars[key]) changed = true;
    next.push(wanted);
  }
  for (const key of KEYS) {
    if (!seen.has(key)) {
      next.push(`${key}=${vars[key]}`);
      changed = true;
    }
  }
  return { content: next.join("\n") + "\n", changed, conflict: null };
}
