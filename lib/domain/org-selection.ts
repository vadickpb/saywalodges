// Picks which org is "active" in the dashboard shell (SD-106). Pure — no I/O,
// no cookies — so the actual cookie read/write stays in app/app/layout.tsx
// and app/app/actions.ts, and this logic is unit-testable on its own.

export type OrgOption = { id: string; name: string };

// Shared with app/app/actions.ts#setActiveOrg (which writes it) and every
// reader of the active org (app/app/layout.tsx, app/app/page.tsx). Lives
// here, not in actions.ts, because a "use server" file may only export
// async functions — a plain string constant there would break the build.
export const ACTIVE_ORG_COOKIE = "active-org-id";

// Falls back to the first org whenever the stored value is missing or no
// longer valid (the user lost that membership, the cookie is stale/forged,
// or there simply is no cookie yet) — never throws, so the shell always has
// a usable active org as long as the list isn't empty.
export function resolveActiveOrgId(orgs: OrgOption[], cookieValue: string | undefined): string | null {
  if (orgs.length === 0) return null;
  if (cookieValue && orgs.some((org) => org.id === cookieValue)) return cookieValue;
  return orgs[0].id;
}
