import { verifySession } from "@/lib/dal/session";
import { signOut } from "./actions";

// Minimal placeholder for the authenticated area — the real dashboard shell
// (navigation, org selector) is SD-106. This page exists to prove the
// session-check pattern: the check runs here, in the page itself, not in a
// shared layout — layouts don't re-run on client-side navigation (Partial
// Rendering), so a layout-level check wouldn't re-verify the session on
// every route change.
export default async function AppPage() {
  const user = await verifySession();

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-stone/10 bg-white p-8 text-center">
        <p className="text-sm text-stone mb-1">Signed in as</p>
        <p className="text-lg text-charcoal mb-6">{user.email}</p>
        <form action={signOut}>
          <button
            type="submit"
            className="px-5 py-2.5 border border-stone/20 text-charcoal text-sm rounded-full hover:border-[#2D4A3E]/40 transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
