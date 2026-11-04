"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveGuide, createGuideLink, revokeGuideLink, uploadGuideImage } from "@/lib/dal/guest-guide";
export async function saveGuideAction(input:unknown,version:unknown,publish:unknown) {
 const parsed=z.object({version:z.number().int().min(0),publish:z.boolean()}).safeParse({version,publish});
 if(!parsed.success)return {ok:false as const,error:'Solicitud inválida.'};
 const result=await saveGuide(input,parsed.data.version,parsed.data.publish);if(result.ok)revalidatePath('/app/site/guide');return result;
}
export async function createGuideLinkAction(input:unknown) {
 const parsed=z.object({label:z.string(),password:z.string(),expiresAt:z.string()}).strict().safeParse(input);
 if(!parsed.success)return {ok:false as const,error:'Revisa los campos del enlace.'};
 const result=await createGuideLink(parsed.data);if(result.ok)revalidatePath('/app/site/guide');return result;
}
export async function revokeGuideLinkAction(id:unknown) {if(typeof id!=='string')return false;const result=await revokeGuideLink(id);if(result)revalidatePath('/app/site/guide');return result;}
export async function uploadGuideImageAction(form:FormData) {const file=form.get('file');if(!(file instanceof File))return null;return uploadGuideImage(file);}
