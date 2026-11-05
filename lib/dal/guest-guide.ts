import "server-only";
import { z } from "zod";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAnon } from "@/lib/supabase/anon";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";
import { houseGuideSchema, guidePasswordSchema, guideTokenSchema, type HouseGuide } from "@/lib/domain/house-guide";
import { createGuideToken, digestGuideToken } from "@/lib/security/guide-credentials";
import { checkImageUpload, MAX_UPLOAD_BYTES } from "@/lib/domain/content-manager";

export async function guideOwnerContext() {
  const { activeOrg, user } = await requireActiveOrg();
  if (!activeOrg || activeOrg.role !== "owner") return null;
  const client = await createClient();
  const { data: property } = await client.from("properties").select("id,name,subdomain,custom_domain").eq("org_id",activeOrg.id).maybeSingle();
  return property ? { client, orgId: activeOrg.id, property, userId: user.id } : null;
}
export async function getGuideEditor() {
  const ctx = await guideOwnerContext(); if (!ctx) return null;
  const [{data: guide,error},{data: links,error: linkError},{data:images,error:imageError}] = await Promise.all([
    ctx.client.from("house_guides").select("draft,published,version").eq("org_id",ctx.orgId).maybeSingle(),
    ctx.client.from("house_guide_links").select("id,label,expires_at,revoked_at,created_at").eq("org_id",ctx.orgId).order("created_at",{ascending:false}),
    ctx.client.from("house_guide_images").select("id").eq("org_id",ctx.orgId),
  ]);
  if(error||linkError||imageError) return { unavailable:true as const };
  const parsed=houseGuideSchema.safeParse(guide?.draft);
  const publishedGuide=houseGuideSchema.safeParse(guide?.published);
  return { unavailable:false as const, guide:parsed.success?parsed.data:{title:`Guía de ${ctx.property.name}`,sections:[]}, version:guide?.version??0,
    publishedGuide:publishedGuide.success?publishedGuide.data:null, propertyName:ctx.property.name, published:Boolean(guide?.published), links:links??[], images:(images??[]).map(i=>i.id) };
}
// Read the published snapshot independently of the editable draft.
export async function getOwnerPublishedGuide() {
  const ctx = await guideOwnerContext();
  if (!ctx) return null;
  const { data, error } = await ctx.client.from("house_guides")
    .select("published").eq("org_id", ctx.orgId).maybeSingle();
  if (error) return null;
  const parsed = houseGuideSchema.safeParse(data?.published);
  if (!parsed.success) return null;
  return { propertyName: ctx.property.name, guide: {
    ...parsed.data, sections: parsed.data.sections.filter(section => section.visible),
  } };
}
export async function saveGuide(input: unknown, version: number, publish: boolean) {
  const parsed=houseGuideSchema.safeParse(input); if(!parsed.success) return {ok:false as const,error:"Revisa títulos, textos e imágenes."};
  if(publish && !parsed.data.sections.some(s=>s.visible)) return {ok:false as const,error:"Añade al menos una sección visible para publicar."};
  const ctx=await guideOwnerContext(); if(!ctx) return {ok:false as const,error:"Solo el dueño puede editar la guía."};
  const {data,error}=await ctx.client.rpc("save_house_guide",{p_org_id:ctx.orgId,p_content:parsed.data,p_version:version,p_publish:publish});
  if(error) return {ok:false as const,error:error.code==='40001'?"La guía cambió en otra ventana. Recarga antes de guardar.":"No se pudo guardar la guía."};
  return {ok:true as const,version:data,guide:parsed.data};
}
export async function createGuideLink(input: {label:string;password:string;expiresAt:string}) {
  const parsed=z.object({label:z.string().trim().min(1).max(100),password:guidePasswordSchema,expiresAt:z.iso.datetime()}).safeParse(input);
  if(!parsed.success) return {ok:false as const,error:"Completa el nombre, una contraseña de al menos 6 caracteres y el vencimiento."};
  const ctx=await guideOwnerContext(); if(!ctx) return {ok:false as const,error:"Solo el dueño puede compartir la guía."};
  const expiry=Date.parse(input.expiresAt); if(expiry<=Date.now()||expiry>Date.now()+365*86400000) return {ok:false as const,error:"El vencimiento debe estar dentro del próximo año."};
  const token=createGuideToken();
  const {error}=await ctx.client.rpc("create_house_guide_link",{p_org_id:ctx.orgId,p_label:parsed.data.label,p_password:parsed.data.password,p_token_hash:digestGuideToken(token),p_expires_at:input.expiresAt});
  if(error) return {ok:false as const,error:"No se pudo crear el enlace. Publica la guía primero; máximo 50 enlaces activos."};
  const host=ctx.property.custom_domain || (env.DEPLOYMENT_MODE==='installation'?env.ROOT_DOMAIN:`${ctx.property.subdomain}.${env.ROOT_DOMAIN}`);
  const scheme=process.env.NODE_ENV==='production'?'https':'http';
  return {ok:true as const,url:`${scheme}://${host}/es/guia/${token}`};
}
export async function revokeGuideLink(id:string) {
  if(!z.uuid().safeParse(id).success) return false; const ctx=await guideOwnerContext();if(!ctx)return false;
  const {data,error}=await ctx.client.rpc("revoke_house_guide_link",{p_org_id:ctx.orgId,p_id:id});return !error && data;
}
export async function uploadGuideImage(file: File) {
  if(file.size===0||file.size>MAX_UPLOAD_BYTES) return null;
  const ctx=await guideOwnerContext(); if(!ctx)return null;
  const bytes=new Uint8Array(await file.arrayBuffer()); const checked=checkImageUpload(bytes);if(!checked.ok)return null;
  const {count,error:countError}=await ctx.client.from("house_guide_images").select("id",{head:true,count:"exact"}).eq("org_id",ctx.orgId);
  if(countError||(count??0)>=360)return null;
  const id=crypto.randomUUID(), path=`${ctx.orgId}/${id}.${checked.kind.ext}`;
  const {error}=await ctx.client.storage.from("house-guide-images").upload(path,bytes,{contentType:checked.kind.mime});if(error)return null;
  const {error:rowError}=await ctx.client.from("house_guide_images").insert({id,org_id:ctx.orgId,storage_path:path});
  return rowError?null:id;
}
export async function ownerGuideImage(id:string) {
  if(!z.uuid().safeParse(id).success)return null;const ctx=await guideOwnerContext();if(!ctx)return null;
  const {data}=await ctx.client.from("house_guide_images").select("storage_path").eq("org_id",ctx.orgId).eq("id",id).maybeSingle();
  if(!data)return null;const result=await ctx.client.storage.from("house-guide-images").download(data.storage_path);return result.error?null:result.data;
}
export function guideCookieName(token:string) { return `house_guide_${digestGuideToken(token).slice(0,20)}`; }
export async function unlockGuide(host:string,token:string,password:string) {
  if(!guideTokenSchema.safeParse(token).success||!guidePasswordSchema.safeParse(password).success)return null;
  const session=createGuideToken();
  const {data,error}=await getSupabaseAnon().rpc("unlock_house_guide",{p_host:host,p_token_hash:digestGuideToken(token),p_password:password,p_session_hash:digestGuideToken(session)});
  return !error&&data?session:null;
}
export async function readGuide(host:string,token:string,session:string|undefined):Promise<HouseGuide|null> {
  if(!guideTokenSchema.safeParse(token).success||!guideTokenSchema.safeParse(session).success||!session)return null;
  const {data,error}=await getSupabaseAnon().rpc("read_house_guide",{p_host:host,p_token_hash:digestGuideToken(token),p_session_hash:digestGuideToken(session)});
  if(error)return null; const parsed=houseGuideSchema.safeParse(data);return parsed.success?parsed.data:null;
}
export async function visitorGuideImage(host:string,token:string,session:string|undefined,id:string) {
  if(!z.uuid().safeParse(id).success||!session)return null;
  const guide=await readGuide(host,token,session);if(!guide?.sections.some(s=>s.images.some(i=>i.id===id)))return null;
  const client=createSupabaseClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false},global:{headers:{'x-guide-session':digestGuideToken(session)}}});
  const {data}=await client.from("house_guide_images").select("storage_path").eq("id",id).maybeSingle();if(!data)return null;
  const result=await client.storage.from("house-guide-images").download(data.storage_path);return result.error?null:result.data;
}
