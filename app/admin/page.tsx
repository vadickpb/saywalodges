"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";

interface PhotosConfig {
  hero: string;
  gallery: string[];
}

export default function AdminPhotos() {
  const [files, setFiles] = useState<string[]>([]);
  const [config, setConfig] = useState<PhotosConfig>({ hero: "", gallery: [] });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch("/api/photos");
    const data = await res.json();
    setFiles(data.files);
    setConfig(data.config);
  }

  useEffect(() => { load(); }, []);

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    await fetch("/api/upload", { method: "POST", body: fd });
    await load();
    setUploading(false);
    setMsg("Photo uploaded ✓");
    setTimeout(() => setMsg(""), 2500);
  }

  async function deleteFile(filename: string) {
    if (!confirm(`Delete ${filename}?`)) return;
    await fetch("/api/upload", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
    });
    setConfig(c => ({
      hero: c.hero === filename ? "" : c.hero,
      gallery: c.gallery.filter(f => f !== filename),
    }));
    await load();
    setMsg("Deleted ✓");
    setTimeout(() => setMsg(""), 2500);
  }

  function setHero(filename: string) {
    setConfig(c => ({ ...c, hero: filename }));
  }

  function toggleGallery(filename: string) {
    setConfig(c => {
      const inGallery = c.gallery.includes(filename);
      return {
        ...c,
        gallery: inGallery
          ? c.gallery.filter(f => f !== filename)
          : [...c.gallery, filename],
      };
    });
  }

  function moveInGallery(filename: string, dir: -1 | 1) {
    setConfig(c => {
      const arr = [...c.gallery];
      const i = arr.indexOf(filename);
      if (i < 0) return c;
      const j = i + dir;
      if (j < 0 || j >= arr.length) return c;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...c, gallery: arr };
    });
  }

  async function saveConfig() {
    setSaving(true);
    await fetch("/api/photos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaving(false);
    setMsg("Saved ✓ — restart dev server or redeploy to see changes");
    setTimeout(() => setMsg(""), 4000);
  }

  const heroFile = files.find(f => f === config.hero);
  const gallerySet = new Set(config.gallery);

  return (
    <div className="min-h-screen bg-[#FAFAF7] p-6 lg:p-10">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-2xl font-light text-[#1a1a1a]">Photo Manager</h1>
            <p className="text-sm text-[#6B7280] mt-1">Saywa Lodges · Admin</p>
          </div>
          <div className="flex items-center gap-3">
            {msg && <span className="text-sm text-[#2D4A3E] font-medium">{msg}</span>}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="px-5 py-2.5 bg-[#8B6914] text-white text-sm rounded-full hover:bg-[#7A5C12] transition-colors disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "+ Upload Photo"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadFile} />
            <button
              onClick={saveConfig}
              disabled={saving}
              className="px-5 py-2.5 bg-[#2D4A3E] text-white text-sm rounded-full hover:bg-[#243D30] transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>

        {/* Hero picker */}
        <div className="mb-10">
          <h2 className="text-xs uppercase tracking-[0.2em] text-[#6B7280] mb-4">Hero Image</h2>
          <div className="relative aspect-[16/6] rounded-2xl overflow-hidden bg-[#6B7280]/10">
            {heroFile ? (
              <Image src={`/images/${heroFile}`} alt="Hero" fill className="object-cover" unoptimized />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-[#6B7280] text-sm">
                Click "Set as Hero" on any photo below
              </div>
            )}
          </div>
        </div>

        {/* Gallery order preview */}
        <div className="mb-10">
          <h2 className="text-xs uppercase tracking-[0.2em] text-[#6B7280] mb-4">
            Gallery Order ({config.gallery.length} photos)
          </h2>
          <div className="flex gap-2 flex-wrap">
            {config.gallery.map((f, i) => (
              <div key={f} className="relative w-20 h-20 rounded-lg overflow-hidden bg-[#6B7280]/10 flex-shrink-0">
                <Image src={`/images/${f}`} alt={f} fill className="object-cover" unoptimized />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center gap-1 opacity-0 hover:opacity-100 transition-opacity">
                  <button onClick={() => moveInGallery(f, -1)} disabled={i === 0} className="text-white text-lg leading-none disabled:opacity-30">‹</button>
                  <button onClick={() => moveInGallery(f, 1)} disabled={i === config.gallery.length - 1} className="text-white text-lg leading-none disabled:opacity-30">›</button>
                </div>
                <span className="absolute top-0.5 left-1 text-white text-xs font-bold">{i + 1}</span>
              </div>
            ))}
            {config.gallery.length === 0 && (
              <p className="text-[#6B7280] text-sm">No gallery photos selected</p>
            )}
          </div>
        </div>

        {/* All photos */}
        <div>
          <h2 className="text-xs uppercase tracking-[0.2em] text-[#6B7280] mb-4">All Photos ({files.length})</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {files.map(f => {
              const isHero = config.hero === f;
              const inGallery = gallerySet.has(f);
              const galleryIdx = config.gallery.indexOf(f);
              return (
                <div
                  key={f}
                  className={`rounded-xl overflow-hidden border-2 transition-colors ${
                    isHero ? "border-[#8B6914]" : inGallery ? "border-[#2D4A3E]" : "border-transparent"
                  }`}
                >
                  <div className="relative aspect-square bg-[#6B7280]/10">
                    <Image src={`/images/${f}`} alt={f} fill className="object-cover" unoptimized />
                    {isHero && (
                      <span className="absolute top-2 left-2 bg-[#8B6914] text-white text-xs px-2 py-0.5 rounded-full">Hero</span>
                    )}
                    {inGallery && (
                      <span className="absolute top-2 right-2 bg-[#2D4A3E] text-white text-xs px-2 py-0.5 rounded-full">#{galleryIdx + 1}</span>
                    )}
                  </div>
                  <div className="p-2 bg-white">
                    <p className="text-xs text-[#6B7280] truncate mb-2">{f}</p>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setHero(f)}
                        className={`flex-1 text-xs py-1 rounded-full transition-colors ${
                          isHero ? "bg-[#8B6914] text-white" : "bg-[#8B6914]/10 text-[#8B6914] hover:bg-[#8B6914]/20"
                        }`}
                      >
                        {isHero ? "✓ Hero" : "Set Hero"}
                      </button>
                      <button
                        onClick={() => toggleGallery(f)}
                        className={`flex-1 text-xs py-1 rounded-full transition-colors ${
                          inGallery ? "bg-[#2D4A3E] text-white" : "bg-[#2D4A3E]/10 text-[#2D4A3E] hover:bg-[#2D4A3E]/20"
                        }`}
                      >
                        {inGallery ? "✓ Gallery" : "+ Gallery"}
                      </button>
                      <button
                        onClick={() => deleteFile(f)}
                        className="px-2 py-1 text-xs rounded-full bg-red-50 text-red-400 hover:bg-red-100 transition-colors"
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="mt-12 text-center text-xs text-[#6B7280]/60">
          /admin · Saywa Lodges Photo Manager · Changes saved to public/photos.json
        </p>
      </div>
    </div>
  );
}
