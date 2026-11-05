// Pure helpers of the one-command local setup (scripts/local.mjs). No I/O, so they are unit-tested.
// Rule that matters: this tooling only ever points a development environment at the LOCAL Supabase stack,
// never at a hosted project ("never point a development environment at production", README).

// Same version as the production database deploy (.github/workflows/deploy-db.yml). `npx supabase` without a version resolves to the latest release, which can
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

// dotenv-style assignment: optional `export`, optional spaces around `=`. Comment lines never match.
const ASSIGNMENT = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/;

/** The value of an assignment as a program would read it: quotes removed, inline comment of an unquoted value cut. */
function readValue(rawValue) {
  const v = rawValue.trim();
  const quoted = /^(["'])(.*?)\1/.exec(v);
  if (quoted) return quoted[2];
  return v.replace(/\s+#.*$/, "").trim();
}

/**
 * Updates ONLY those four variables inside an existing .env.local, keeping every other line (comments, other settings, order, line endings).
 * Refuses (conflict) when ANY definition of a Supabase URL in the file points to a hosted project or cannot be read as a URL: a duplicate
 * further down used to win, so every definition counts. It never silently overwrites a file that may hold real credentials.
 * @returns {{ content: string, changed: boolean, conflict: string | null }}
 */
export function mergeEnvFile(existing, vars) {
  const eol = existing.includes("\r\n") ? "\r\n" : "\n";
  const lines = existing === "" ? [] : existing.replace(/\r?\n$/, "").split(/\r?\n/);
  for (const line of lines) {
    const m = ASSIGNMENT.exec(line);
    if (!m || (m[1] !== "SUPABASE_URL" && m[1] !== "NEXT_PUBLIC_SUPABASE_URL")) continue;
    const value = readValue(m[2]);
    if (value === "") continue; // a blank template entry
    if (!isLocalUrl(value)) {
      return { content: existing, changed: false, conflict: `${m[1]} is not a local URL (${URL.canParse(value) ? new URL(value).host : "unreadable value"}). If it is a hosted project, keep it and use that file as it is; if it is a leftover, remove the line by hand and run this again.` };
    }
  }
  // Real credentials without a URL: a service-role/anon key already there that is not the local one, with no local URL next to it, may belong to
  // a hosted project. Do not overwrite it silently.
  const hasLocalUrl = lines.some((l) => { const m = ASSIGNMENT.exec(l); return m && (m[1] === "SUPABASE_URL" || m[1] === "NEXT_PUBLIC_SUPABASE_URL") && readValue(m[2]) !== ""; });
  if (!hasLocalUrl) {
    for (const line of lines) {
      const m = ASSIGNMENT.exec(line);
      if (m && (m[1] === "SUPABASE_SERVICE_ROLE_KEY" || m[1] === "NEXT_PUBLIC_SUPABASE_ANON_KEY")) {
        const value = readValue(m[2]);
        if (value !== "" && value !== vars[m[1]]) {
          return { content: existing, changed: false, conflict: `${m[1]} already holds a key that is not the local one and there is no local Supabase URL beside it. It may be a real credential: keep it, or remove the line by hand if it is a leftover.` };
        }
      }
    }
  }
  let changed = false;
  const seen = new Set();
  const next = [];
  for (const line of lines) {
    const m = ASSIGNMENT.exec(line);
    const key = m && KEYS.includes(m[1]) ? m[1] : null;
    if (!key) {
      next.push(line);
      continue;
    }
    if (seen.has(key)) {
      changed = true; // a duplicate definition is dropped: exactly one is left
      continue;
    }
    seen.add(key);
    if (readValue(m[2]) !== vars[key] || !line.startsWith(`${key}=`)) changed = true;
    next.push(`${key}=${vars[key]}`);
  }
  for (const key of KEYS) {
    if (!seen.has(key)) {
      next.push(`${key}=${vars[key]}`);
      changed = true;
    }
  }
  return { content: next.join(eol) + eol, changed, conflict: null };
}

/**
 * The dev server reads, in this order of precedence: variables already in the process environment, then `.env.development.local`,
 * `.env.local`, `.env.development` and `.env`. Anything in that chain that points to a hosted project would beat what this tooling
 * writes, so it must be checked too, not only `.env.local`.
 * @param {Record<string, string | undefined>} env  usually process.env
 * @returns {string | null}  a message when a Supabase URL in the environment is not local
 */
export function environmentConflict(env) {
  for (const key of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
    const value = (env[key] ?? "").trim();
    if (value !== "" && !isLocalUrl(value)) {
      return `${key} está definida en tu terminal (variable de entorno) y no es local (${URL.canParse(value) ? new URL(value).host : "valor ilegible"}). Esa variable le gana a .env.local. Quítala con \`unset ${key}\` (y revisa SUPABASE_SERVICE_ROLE_KEY) en esta terminal y vuelve a ejecutar.`;
    }
  }
  return null;
}

/** Other dotenv files of the dev-server chain that this tooling never writes but must not be beaten by. */
export const OTHER_ENV_FILES = [".env.development.local", ".env.development", ".env"];
