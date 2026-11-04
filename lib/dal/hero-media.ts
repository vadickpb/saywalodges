import "server-only";
import { z } from "zod";
import { guideOwnerContext } from "@/lib/dal/guest-guide";
import { getSupabaseAnon } from "@/lib/supabase/anon";
import { getPublicPhotoUrl } from "@/lib/storage";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { inspectHeroVideo, MAX_HERO_VIDEO_BYTES } from "@/lib/domain/hero-video";

export async function getHeroMediaEditor() {
 const ctx=await guideOwnerContext();if(!ctx)return null;
 const [{data,error},{data:photo}]=await Promise.all([
  ctx.client.from("property_hero_media").select("mode,video_path").eq("org_id",ctx.orgId).maybeSingle(),
  ctx.client.from("photos").select("storage_path").eq("org_id",ctx.orgId).eq("role","hero").is("space_id",null).maybeSingle()
 ]);
 return {available:!error,mode:data?.mode==='video'?'video':'photo',videoPath:data?.video_path??null,videoUrl:data?.video_path?heroPreviewUrl(data.video_path):null,poster:photo?getPublicPhotoUrl(photo.storage_path):''};
}
export function heroPreviewUrl(path:string) {return `/app/site/appearance/video/preview/${path.split('/').at(-1)?.replace('.mp4','')}`;}
export async function getPublicHeroVideo(orgId:string,lang:string) {
 const {data,error}=await getSupabaseAnon().from("property_hero_media").select("mode,video_path").eq("org_id",orgId).maybeSingle();
 return !error&&data?.mode==='video'&&data.video_path?`/${lang}/video/${data.video_path.split('/').at(-1)?.replace('.mp4','')}`:null;
}
export async function prepareHeroUpload() {
 const ctx=await guideOwnerContext();if(!ctx)return null;
 const path=`${ctx.orgId}/hero/${crypto.randomUUID()}.mp4`;
 const {data,error}=await ctx.client.storage.from("site-video-uploads").createSignedUploadUrl(path);
 return error?null:{path,token:data.token};
}
export async function finishHeroUpload(path:string) {
 const ctx=await guideOwnerContext();if(!ctx||!z.string().regex(new RegExp(`^${ctx.orgId}/hero/[a-f0-9-]{36}\\.mp4$`)).safeParse(path).success)return {ok:false as const,error:'No tienes acceso a ese video.'};
 const {data,error}=await ctx.client.storage.from("site-video-uploads").download(path);
 if(error||!data||data.size>MAX_HERO_VIDEO_BYTES)return {ok:false as const,error:'No se pudo leer el video.'};
 const bytes=new Uint8Array(await data.arrayBuffer());const metadata=inspectHeroVideo(bytes);
 if(!metadata){await ctx.client.storage.from("site-video-uploads").remove([path]);return {ok:false as const,error:'Usa un MP4 H.264 sin audio de hasta 60 segundos y 30 MB.'};}
 const {error:uploadError}=await ctx.client.storage.from("site-videos").upload(path,bytes,{contentType:'video/mp4',upsert:false});
 if(uploadError)return {ok:false as const,error:'No se pudo guardar el video.'};
 // The privileged client is used only for an RPC, never for Storage or table queries.
 const {error:verifyError}=await getSupabaseAdmin().rpc('register_verified_hero_video',{p_org_id:ctx.orgId,p_user_id:ctx.userId,p_path:path});
 if(verifyError)return {ok:false as const,error:'No se pudo validar el video para publicación.'};
 // Publication is explicit; the verified object remains private until selected.
 await ctx.client.storage.from("site-video-uploads").remove([path]);
 return {ok:true as const,path,url:heroPreviewUrl(path)};
}
export async function publishHeroMedia(mode:'photo'|'video',path:string|null) {
 const ctx=await guideOwnerContext();if(!ctx)return false;
 const parsed=z.object({mode:z.enum(['photo','video']),path:z.string().max(150).nullable()}).safeParse({mode,path});if(!parsed.success)return false;
 const {data,error}=await ctx.client.rpc("save_hero_media",{p_org_id:ctx.orgId,p_mode:mode,p_video_path:path??''});return !error&&data;
}

export async function readOwnerHeroVideo(id:string) {
 if(!z.uuid().safeParse(id).success)return null;const ctx=await guideOwnerContext();if(!ctx)return null;
 const {data,error}=await ctx.client.storage.from('site-videos').download(`${ctx.orgId}/hero/${id}.mp4`);return error?null:data;
}
export async function readPublicHeroVideo(host:string,id:string) {
 if(!z.uuid().safeParse(id).success)return null;
 const {getSiteByHost}=await import('@/lib/dal/public/site');const {getProperty}=await import('@/lib/dal/public/property');
 const site=await getSiteByHost(host);if(!site)return null;
 const property=await getProperty(site.slug).catch(()=>null);if(!property)return null;
 const {data:media}=await getSupabaseAnon().from('property_hero_media').select('mode,video_path').eq('org_id',property.orgId).maybeSingle();
 const path=`${property.orgId}/hero/${id}.mp4`;if(media?.mode!=='video'||media.video_path!==path)return null;
 const {data,error}=await getSupabaseAnon().storage.from('site-videos').download(path);return error?null:data;
}
