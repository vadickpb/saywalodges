import { describe, expect, it } from "vitest";
import { checkHeroVideo, inspectHeroVideo, MAX_HERO_VIDEO_BYTES } from "./hero-video";
function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const size = 8 + parts.reduce((n,p) => n + p.length,0); const out = new Uint8Array(size);
  new DataView(out.buffer).setUint32(0,size); out.set(new TextEncoder().encode(type),4);
  let pos=8; for(const part of parts) { out.set(part,pos); pos+=part.length; } return out;
}
function fixture(seconds=10, audio=false): Uint8Array {
  const mvhd=new Uint8Array(100); const v=new DataView(mvhd.buffer); v.setUint32(12,1000); v.setUint32(16,seconds*1000);
  const handler=new Uint8Array(24); handler.set(new TextEncoder().encode(audio?'soun':'vide'),8);
  const sample=new Uint8Array(78); const d=new DataView(sample.buffer); d.setUint16(24,1280); d.setUint16(26,720);
  const stsd=new Uint8Array(8); new DataView(stsd.buffer).setUint32(4,1);
  const track=box('trak',box('mdia',box('hdlr',handler),box('minf',box('stbl',box('stsd',stsd,box('avc1',sample,box('avcC',new Uint8Array(7))))))));
  const parts=[box('ftyp',new TextEncoder().encode('isom\0\0\0\0isomiso2')),box('moov',box('mvhd',mvhd),track),box('mdat',new Uint8Array(10))];
  const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0)); let pos=0; for(const p of parts) {out.set(p,pos);pos+=p.length;} return out;
}
describe('hero video validation',()=>{
 it('accepts bounded H264 silent movies and typed array offsets',()=>{
  expect(inspectHeroVideo(fixture())).toEqual({duration:10}); const b=new Uint8Array(fixture().length+8);b.set(fixture(),8);expect(checkHeroVideo(b.subarray(8))).toBe(true);
 });
 it('rejects signatures without an actual movie, truncation and oversized uploads',()=>{
  expect(checkHeroVideo(box('ftyp',new TextEncoder().encode('isom\0\0\0\0isomiso2')))).toBe(false);
  expect(checkHeroVideo(fixture().slice(0,-2))).toBe(false);expect(checkHeroVideo(new Uint8Array(MAX_HERO_VIDEO_BYTES+1))).toBe(false);
 });
 it('rejects overlong, empty and audio movies',()=>{expect(checkHeroVideo(fixture(61))).toBe(false);expect(checkHeroVideo(fixture(0))).toBe(false);expect(checkHeroVideo(fixture(10,true))).toBe(false);});
});
