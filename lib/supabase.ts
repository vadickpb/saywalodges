// Backward-compatible shim over lib/supabase/admin.ts, kept so existing
// callers (lib/property.ts, lib/photos.ts, lib/spaces.ts, app/api/admin/*)
// don't need to change until SD-104 migrates them onto the DAL. New code
// must import lib/supabase/{server,browser,admin} directly, not this file.
export { getSupabaseAdmin as getSupabase, PHOTOS_BUCKET, getPublicPhotoUrl } from "./supabase/admin";
