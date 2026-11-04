import { cookies } from "next/headers";
import { guideCookieName,visitorGuideImage } from "@/lib/dal/guest-guide";
import { guideTokenSchema } from "@/lib/domain/house-guide";
export async function GET(_request:Request,{params}:{params:Promise<{host:string;lang:string;token:string;id:string}>}) {
 const{host,token,id}=await params;
 const session=guideTokenSchema.safeParse(token).success?(await cookies()).get(guideCookieName(token))?.value:undefined;
 const image=await visitorGuideImage(host,token,session,id);
 return new Response(image??'Not found',{status:image?200:404,headers:{'Content-Type':image?.type||'text/plain','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'}});
}
