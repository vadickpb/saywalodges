"use server";
import { cookies } from "next/headers";
import { z } from "zod";
import { unlockGuide,guideCookieName } from "@/lib/dal/guest-guide";
import { guideTokenSchema,guidePasswordSchema } from "@/lib/domain/house-guide";
import { guestGuideCopy } from "@/dictionaries/guest-guide";
const context=z.object({host:z.string().min(1).max(255),lang:z.enum(['es','en']),token:guideTokenSchema});
export async function unlockGuideAction(host:string,lang:string,token:string,_previous:{error:string},form:FormData) {
 const ctx=context.safeParse({host,lang,token});const pwd=guidePasswordSchema.safeParse(form.get('password'));
 const error=guestGuideCopy(lang).error;if(!ctx.success||!pwd.success)return {error};
 const session=await unlockGuide(host,token,pwd.data);if(!session)return {error};
 (await cookies()).set(guideCookieName(token),session,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:`/${lang}/guia/${token}`,maxAge:86400});
 return {error:''};
}
export async function closeGuideAction(lang:string,token:string) {
 if(!z.enum(['es','en']).safeParse(lang).success||!guideTokenSchema.safeParse(token).success)return;
 (await cookies()).set(guideCookieName(token),'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:`/${lang}/guia/${token}`,maxAge:0});
}
