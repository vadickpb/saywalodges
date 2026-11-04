export const MAX_HERO_VIDEO_BYTES = 30 * 1024 * 1024;
export const MAX_HERO_VIDEO_SECONDS = 60;

type Box = { type: string; start: number; end: number };
// Bounded ISO-BMFF parser: no external process, fetch or client metadata is trusted.
export function inspectHeroVideo(bytes: Uint8Array): { duration: number } | null {
  if (bytes.length < 32 || bytes.length > MAX_HERO_VIDEO_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
  let count = 0;
  function boxes(start: number, end: number): Box[] {
    const out: Box[] = [];
    while (start < end) {
      if (++count > 10000 || start + 8 > end) throw new Error("invalid box");
      let size = view.getUint32(start); let header = 8;
      if (size === 1) { if (start + 16 > end) throw new Error("truncated"); const wide = view.getBigUint64(start + 8); if (wide > BigInt(end)) throw new Error("oversized"); size = Number(wide); header = 16; }
      if (size === 0) size = end - start;
      if (size < header || start + size > end) throw new Error("invalid size");
      out.push({ type: text(start + 4, 4), start: start + header, end: start + size }); start += size;
    }
    return out;
  }
  try {
    const top = boxes(0, bytes.length);
    const ftyp = top.find(b => b.type === "ftyp");
    const moov = top.find(b => b.type === "moov");
    if (!ftyp || ftyp.end - ftyp.start < 16 || !moov || !top.some(b => b.type === "mdat" && b.end > b.start)) return null;
    const brands = new Set(["isom", "iso2", "mp41", "mp42", "avc1"]);
    if (!brands.has(text(ftyp.start, 4)) && !boxesBrand()) return null;
    function boxesBrand() { if (!ftyp) return false; for (let p = ftyp.start + 8; p + 4 <= ftyp.end; p += 4) if (brands.has(text(p, 4))) return true; return false; }
    const movie = boxes(moov.start, moov.end);
    const mvhd = movie.find(b => b.type === "mvhd");
    if (!mvhd || mvhd.end - mvhd.start < 20) return null;
    const version = bytes[mvhd.start];
    if (version !== 0 && version !== 1) return null;
    const timeOffset = mvhd.start + (version === 1 ? 20 : 12);
    if (timeOffset + (version === 1 ? 12 : 8) > mvhd.end) return null;
    const scale = view.getUint32(timeOffset);
    const ticks = version === 1 ? Number(view.getBigUint64(timeOffset + 4)) : view.getUint32(timeOffset + 4);
    const duration = ticks / scale;
    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_HERO_VIDEO_SECONDS) return null;
    let video = false;
    for (const track of movie.filter(b => b.type === "trak")) {
      const mdia = boxes(track.start, track.end).find(b => b.type === "mdia"); if (!mdia) return null;
      const media = boxes(mdia.start, mdia.end);
      const hdlr = media.find(b => b.type === "hdlr"); if (!hdlr || hdlr.end - hdlr.start < 12) return null;
      const handler = text(hdlr.start + 8, 4);
      // First delivery accepts silent scenic clips; no inaccessible spoken content.
      if (handler === "soun") return null;
      if (handler !== "vide") continue;
      const minf = media.find(b => b.type === "minf"); if (!minf) return null;
      const stbl = boxes(minf.start, minf.end).find(b => b.type === "stbl"); if (!stbl) return null;
      const stsd = boxes(stbl.start, stbl.end).find(b => b.type === "stsd"); if (!stsd || stsd.end - stsd.start < 8) return null;
      const entries = boxes(stsd.start + 8, stsd.end);
      if (entries.length !== view.getUint32(stsd.start + 4) || !entries.length) return null;
      for (const entry of entries) {
        if (entry.type !== "avc1" || entry.end - entry.start < 78) return null;
        const width = view.getUint16(entry.start + 24), height = view.getUint16(entry.start + 26);
        if (!width || !height || width > 3840 || height > 3840) return null;
        if (!boxes(entry.start + 78, entry.end).some(b => b.type === "avcC" && b.end - b.start >= 7)) return null;
      }
      video = true;
    }
    return video ? { duration } : null;
  } catch { return null; }
}
export function checkHeroVideo(bytes: Uint8Array): boolean { return inspectHeroVideo(bytes) !== null; }
