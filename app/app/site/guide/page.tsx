import { getGuideEditor } from "@/lib/dal/guest-guide";
import { GuideEditor } from "./guide-editor";
export default async function GuidePage() {
 const data=await getGuideEditor();
 if(!data)return <p>Solo el dueño puede administrar la guía privada de la casa.</p>;
 if(data.unavailable)return <p>La guía todavía no está disponible. Falta habilitar la actualización de la base de datos.</p>;
 return <main className="max-w-5xl"><h1 className="text-2xl font-semibold">Guía privada de la casa</h1><p className="my-3 text-muted-foreground">Prepara instrucciones y reglas con fotos. Guarda un borrador o publica para quienes reciban tu enlace y contraseña.</p><GuideEditor initialGuide={data.guide} initialVersion={data.version} published={data.published} links={data.links} /></main>;
}
