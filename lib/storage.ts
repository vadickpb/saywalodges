export const PHOTOS_BUCKET = "property-photos";

// Pure URL construction, no Supabase client needed: for a public bucket,
// getPublicUrl() is just string-building (mirrors @supabase/storage-js's
// own implementation — @supabase/storage-js/dist/index.cjs, getPublicUrl).
// Reading NEXT_PUBLIC_SUPABASE_URL as a literal process.env access (not via
// lib/env.ts, which also validates the service-role key) keeps this safe
// to import from anywhere, including the public DAL, without pulling in
// any service-role dependency.
export function getPublicPhotoUrl(storagePath: string): string {
  return encodeURI(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PHOTOS_BUCKET}/${storagePath}`);
}
