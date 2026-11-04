import { readPublicHeroVideo } from "@/lib/dal/hero-media";
import { videoResponse } from "@/lib/http/video-response";
export async function GET(request:Request,{params}:{params:Promise<{host:string;id:string}>}){const{host,id}=await params;return videoResponse(await readPublicHeroVideo(host,id),request.headers.get('range'));}
