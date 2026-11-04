import { getHeroMediaEditor } from "@/lib/dal/hero-media";
import { HeroMediaForm } from "./video/video-form";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { getPropertySettings, getSiteAppearance } from "@/lib/dal/property";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppearanceForm } from "./appearance-form";

// requireActiveOrg() runs verifySession() itself, like every protected page.
export default async function AppearancePage() {
  const { activeOrg } = await requireActiveOrg();
  const supabase = await createClient();
  const media = await getHeroMediaEditor();
  const [appearance, settings] = activeOrg
    ? await Promise.all([getSiteAppearance(supabase, activeOrg.id), getPropertySettings(supabase, activeOrg.id)])
    : [null, null];

  if (!appearance || !settings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Apariencia</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Todavía no tienes una propiedad configurada para esta organización.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-foreground">Apariencia del sitio</h1>
      {media && (media.available ? <HeroMediaForm initialMode={media.mode} initialPath={media.videoPath} initialUrl={media.videoUrl} poster={media.poster} /> : <p className="mb-6">El video de portada estará disponible al habilitar la actualización de la base de datos.</p>)}
      <AppearanceForm initialTheme={appearance.theme} initialContent={appearance.content} propertyName={settings.name} />
    </div>
  );
}
