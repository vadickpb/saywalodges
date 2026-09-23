import { createClient } from "@supabase/supabase-js";
import type { WebSocketLikeConstructor } from "@supabase/realtime-js";
import ws from "ws";

// Server-only client — uses the secret/service-role key, never exposed to the browser.
// Public reads for the site and all admin writes go through this client; there is no
// client-side Supabase usage in this app. We never use Realtime, but supabase-js
// initializes a RealtimeClient regardless, which needs a WebSocket constructor —
// Node < 22 has no native `WebSocket` global, so it's provided explicitly here.
export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  }
  return createClient(url, key, {
    auth: { persistSession: false },
    realtime: { transport: ws as unknown as WebSocketLikeConstructor },
  });
}

export const PHOTOS_BUCKET = "property-photos";

export function getPublicPhotoUrl(storagePath: string): string {
  return getSupabase().storage.from(PHOTOS_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}
