import { ownerGuideImage } from "@/lib/dal/guest-guide";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
 const {id}=await params;const image=await ownerGuideImage(id);
 return new Response(image??'Not found',{status:image?200:404,headers:{'Content-Type':image?.type||'text/plain','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'}});
}
