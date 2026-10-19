// Backward-compatible shim over lib/supabase/admin.ts. SD-104 moved the
// public site's reads off this (now lib/dal/public/*, on the anon client);
// app/api/admin/* still uses it for their own service-role mutations —
// an admin-scoped DAL doesn't exist yet (Fase 2, SD-201/202). New code
// must import lib/supabase/{server,browser,admin} directly, not this file.
export { getSupabaseAdmin as getSupabase, PHOTOS_BUCKET, getPublicPhotoUrl } from "./supabase/admin";
