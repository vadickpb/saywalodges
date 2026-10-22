import { requireActiveOrg } from "@/lib/dal/organizations";
import { getPropertySettings } from "@/lib/dal/property";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SettingsForm } from "./settings-form";

// requireActiveOrg() calls verifySession() itself — same authoritative
// check every protected page makes on its own (see lib/dal/session.ts).
export default async function SitePage() {
  const { activeOrg } = await requireActiveOrg();
  const supabase = await createClient();
  const settings = activeOrg ? await getPropertySettings(supabase, activeOrg.id) : null;

  if (!settings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sitio</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Todavía no tienes una propiedad configurada para esta organización.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-foreground">Información del alojamiento</h1>
      <SettingsForm initial={settings} />
    </div>
  );
}
