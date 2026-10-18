import { verifySession } from "@/lib/dal/session";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <p className="text-sm text-muted-foreground">Signed in as</p>
          <p className="text-lg text-foreground">{user.email}</p>
        </CardHeader>
        <CardContent>
          <form action={signOut}>
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
