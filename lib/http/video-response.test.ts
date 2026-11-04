import { describe,it,expect } from 'vitest';
import { videoResponse } from './video-response';
describe('video seeking',()=>{
 const video=new Blob(['0123456789']);
 it('serves complete and partial videos without caching',async()=>{expect(videoResponse(video,null).status).toBe(200);const r=videoResponse(video,'bytes=2-5');expect(r.status).toBe(206);expect(await r.text()).toBe('2345');expect(r.headers.get('Cache-Control')).toContain('no-store');});
 it('accepts suffix and open ranges',async()=>{expect(await videoResponse(video,'bytes=-3').text()).toBe('789');expect(await videoResponse(video,'bytes=8-').text()).toBe('89');});
 it('rejects invalid ranges and missing media',()=>{for(const range of ['bytes=20-','bytes=5-1','bytes=-0','bytes=0-2,4-5','invalid'])expect(videoResponse(video,range).status).toBe(416);expect(videoResponse(null,null).status).toBe(404);});
});
