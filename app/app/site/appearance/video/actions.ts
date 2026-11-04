"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prepareHeroUpload,finishHeroUpload,publishHeroMedia } from "@/lib/dal/hero-media";
export async function prepareHeroUploadAction() {return prepareHeroUpload();}
export async function finishHeroUploadAction(path:unknown) {if(typeof path!=='string'||path.length>150)return {ok:false as const,error:'Video inválido.'};return finishHeroUpload(path);}
export async function publishHeroMediaAction(mode:unknown,path:unknown) {
 const p=z.object({mode:z.enum(['photo','video']),path:z.string().max(150).nullable()}).safeParse({mode,path});if(!p.success)return false;
 const ok=await publishHeroMedia(p.data.mode,p.data.path);if(ok)revalidatePath('/app/site/appearance');return ok;
}
