// Preserve seeking without exposing private Storage credentials or signed draft URLs.
export function videoResponse(video:Blob|null,range:string|null) {
 const headers:Record<string,string>={'Content-Type':'video/mp4','Cache-Control':'private, no-store','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'};
 if(!video)return new Response('Not found',{status:404,headers:{...headers,'Content-Type':'text/plain'}});
 // Stream full responses without Content-Length: Vercel's buffered response cap is 4.5 MB.
 if(!range)return new Response(video.stream(),{headers});
 const m=/^bytes=(\d*)-(\d*)$/.exec(range);
 if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${video.size}`}});
 const start=m[1]?Number(m[1]):Math.max(0,video.size-Number(m[2]));
 let end=m[1]?(m[2]?Math.min(Number(m[2]),video.size-1):video.size-1):video.size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start> end||start>=video.size||(!m[1]&&Number(m[2])===0))return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${video.size}`}});
 // Bound individual seek responses below the buffered platform limit.
 end=Math.min(end,start+4*1024*1024-1);
 return new Response(video.slice(start,end+1,'video/mp4').stream(),{status:206,headers:{...headers,'Content-Range':`bytes ${start}-${end}/${video.size}`,'Content-Length':String(end-start+1)}});
}
