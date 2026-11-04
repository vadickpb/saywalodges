import { readOwnerHeroVideo } from "@/lib/dal/hero-media";
import { videoResponse } from "@/lib/http/video-response";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){const{id}=await params;return videoResponse(await readOwnerHeroVideo(id),request.headers.get('range'));}
