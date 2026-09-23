"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";

// ─── Types (mirror the API payloads in app/api/admin/*) ─────────────────────

type Photo = { id: string; url: string; role: "hero" | "gallery" };

type Room = {
  id?: string;
  key: string;
  category: "pool" | "rooms" | "common" | "outdoor";
  icon: string;
  capacity: string | null;
  badgeEn: string | null;
  badgeEs: string | null;
  labelEn: string;
  labelEs: string;
  descEn: string;
  descEs: string;
  sortOrder: number;
};

type RateTier = {
  id?: string;
  seasonEn: string;
  seasonEs: string;
  fromEn: string;
  fromEs: string;
  periodEn: string;
  periodEs: string;
  tagEn: string;
  tagEs: string;
  sortOrder: number;
};

type Amenity = {
  id?: string;
  icon: string;
  titleEn: string;
  titleEs: string;
  descEn: string;
  descEs: string;
  sortOrder: number;
};

type Distance = {
  id?: string;
  placeEn: string;
  placeEs: string;
  timeEn: string;
  timeEs: string;
  icon: string;
  sortOrder: number;
};

type PropertyInfo = {
  name: string;
  whatsappNumber: string;
  whatsappMessageEn: string;
  whatsappMessageEs: string;
  email: string;
  mapsUrl: string;
  airbnbUrl: string;
  addressLocality: string;
  addressRegion: string;
  addressCountry: string;
  latitude: number | null;
  longitude: number | null;
  metaTitleEn: string;
  metaTitleEs: string;
  metaDescriptionEn: string;
  metaDescriptionEs: string;
  metaKeywordsEn: string[];
  metaKeywordsEs: string[];
  priceRange: string;
  starRating: number | null;
  petsAllowed: boolean;
  logoUrl: string;
};

type Content = {
  property: PropertyInfo;
  rooms: Room[];
  rateTiers: RateTier[];
  amenities: Amenity[];
  distances: Distance[];
};

const TABS = ["Photos", "Rooms", "Rates", "Amenities", "Business"] as const;
type Tab = (typeof TABS)[number];

const inputCls =
  "px-3 py-2 rounded-lg border border-stone/20 bg-white text-sm text-[#1a1a1a] focus:outline-none focus:border-[#2D4A3E] transition-colors w-full";
const labelCls = "text-xs text-[#6B7280] uppercase tracking-wide mb-1 block";
const cardCls = "rounded-2xl border border-stone/10 bg-white p-5";

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const copy = [...arr];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy.map((item, idx) => ({ ...item, sortOrder: idx }));
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("Photos");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [content, setContent] = useState<Content | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  async function loadPhotos() {
    const res = await fetch("/api/admin/photos");
    const data = await res.json();
    setPhotos(data.photos);
  }

  async function loadContent() {
    const res = await fetch("/api/admin/content");
    const data = await res.json();
    setContent(data);
  }

  useEffect(() => {
    // loadPhotos/loadContent are reused after mutations (upload, save, reorder), so they
    // can't be inlined here. This whole admin page is replaced by the dashboard in SD-203.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPhotos();
    loadContent();
  }, []);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(""), 3000);
  }

  // ─── Photos ────────────────────────────────────────────────────────────

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    await fetch("/api/admin/photos", { method: "POST", body: fd });
    await loadPhotos();
    setUploading(false);
    flash("Photo uploaded ✓");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function deletePhoto(id: string) {
    if (!confirm("Delete this photo?")) return;
    await fetch("/api/admin/photos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await loadPhotos();
    flash("Deleted ✓");
  }

  function setHero(id: string) {
    setPhotos((prev) => prev.map((p) => ({ ...p, role: p.id === id ? "hero" : p.role === "hero" ? "gallery" : p.role })));
  }

  function moveGalleryPhoto(id: string, dir: -1 | 1) {
    setPhotos((prev) => {
      const gallery = prev.filter((p) => p.role === "gallery");
      const hero = prev.filter((p) => p.role === "hero");
      const i = gallery.findIndex((p) => p.id === id);
      if (i < 0) return prev;
      const reordered = move(gallery, i, dir);
      return [...hero, ...reordered];
    });
  }

  async function savePhotos() {
    setSaving(true);
    const hero = photos.find((p) => p.role === "hero");
    const gallery = photos.filter((p) => p.role === "gallery");
    await fetch("/api/admin/photos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ heroId: hero?.id ?? null, order: gallery.map((p) => p.id) }),
    });
    await loadPhotos();
    setSaving(false);
    flash("Saved ✓");
  }

  // ─── Logo ──────────────────────────────────────────────────────────────

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !content) return;
    setLogoUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/logo", { method: "POST", body: fd });
    const data = await res.json();
    setContent({ ...content, property: { ...content.property, logoUrl: data.url } });
    setLogoUploading(false);
    flash("Logo uploaded ✓");
    if (logoRef.current) logoRef.current.value = "";
  }

  async function removeLogo() {
    if (!content) return;
    await fetch("/api/admin/logo", { method: "DELETE" });
    setContent({ ...content, property: { ...content.property, logoUrl: "" } });
    flash("Logo removed ✓");
  }

  // ─── Content (rooms / rates / amenities / business) ────────────────────

  async function saveContent() {
    if (!content) return;
    setSaving(true);
    await fetch("/api/admin/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content),
    });
    await loadContent();
    setSaving(false);
    flash("Saved ✓");
  }

  const hero = photos.find((p) => p.role === "hero");
  const gallery = photos.filter((p) => p.role === "gallery");

  return (
    <div className="min-h-screen bg-[#FAFAF7] p-6 lg:p-10">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-light text-[#1a1a1a]">{content?.property.name || "Admin"} · Admin</h1>
            <p className="text-sm text-[#6B7280] mt-1">Contenido del sitio</p>
          </div>
          {msg && <span className="text-sm text-[#2D4A3E] font-medium">{msg}</span>}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-colors ${
                tab === t ? "bg-[#2D4A3E] text-white" : "bg-white text-[#6B7280] border border-stone/20 hover:border-[#2D4A3E]/40"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "Photos" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xs uppercase tracking-[0.2em] text-[#6B7280]">Hero & Gallery</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="px-5 py-2.5 bg-[#8B6914] text-white text-sm rounded-full hover:bg-[#7A5C12] transition-colors disabled:opacity-50"
                >
                  {uploading ? "Uploading…" : "+ Upload Photo"}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadFile} />
                <button
                  onClick={savePhotos}
                  disabled={saving}
                  className="px-5 py-2.5 bg-[#2D4A3E] text-white text-sm rounded-full hover:bg-[#243D30] transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>

            <div className="mb-10">
              <p className="text-xs uppercase tracking-[0.2em] text-[#6B7280] mb-4">Hero Image</p>
              <div className="relative aspect-[16/6] rounded-2xl overflow-hidden bg-[#6B7280]/10">
                {hero ? (
                  <Image src={hero.url} alt="Hero" fill className="object-cover" unoptimized />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[#6B7280] text-sm">
                    Click &quot;Set as Hero&quot; on any photo below
                  </div>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#6B7280] mb-4">
                Gallery ({gallery.length} photos, hero excluded)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {photos.map((p) => (
                  <div
                    key={p.id}
                    className={`rounded-xl overflow-hidden border-2 ${
                      p.role === "hero" ? "border-[#8B6914]" : "border-[#2D4A3E]/30"
                    }`}
                  >
                    <div className="relative aspect-square bg-[#6B7280]/10">
                      <Image src={p.url} alt="" fill className="object-cover" unoptimized />
                      {p.role === "hero" && (
                        <span className="absolute top-2 left-2 bg-[#8B6914] text-white text-xs px-2 py-0.5 rounded-full">
                          Hero
                        </span>
                      )}
                    </div>
                    <div className="p-2 bg-white flex flex-col gap-1.5">
                      <div className="flex gap-1">
                        <button
                          onClick={() => setHero(p.id)}
                          disabled={p.role === "hero"}
                          className="flex-1 text-xs py-1 rounded-full bg-[#8B6914]/10 text-[#8B6914] hover:bg-[#8B6914]/20 disabled:opacity-50"
                        >
                          {p.role === "hero" ? "✓ Hero" : "Set Hero"}
                        </button>
                        <button
                          onClick={() => deletePhoto(p.id)}
                          className="px-2 py-1 text-xs rounded-full bg-red-50 text-red-400 hover:bg-red-100"
                        >
                          ✕
                        </button>
                      </div>
                      {p.role === "gallery" && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => moveGalleryPhoto(p.id, -1)}
                            className="flex-1 text-xs py-1 rounded-full bg-stone/10 hover:bg-stone/20"
                          >
                            ‹
                          </button>
                          <button
                            onClick={() => moveGalleryPhoto(p.id, 1)}
                            className="flex-1 text-xs py-1 rounded-full bg-stone/10 hover:bg-stone/20"
                          >
                            ›
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "Rooms" && content && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-end">
              <button onClick={saveContent} disabled={saving} className="px-5 py-2.5 bg-[#2D4A3E] text-white text-sm rounded-full hover:bg-[#243D30] disabled:opacity-50">
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
            {content.rooms.map((room, i) => (
              <div key={room.id ?? i} className={cardCls}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex gap-2 items-center">
                    <span className="text-lg">{room.icon || "🏠"}</span>
                    <span className="text-sm text-[#6B7280]">{room.key}</span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setContent({ ...content, rooms: move(content.rooms, i, -1) })} className="px-2 py-1 text-xs rounded-full bg-stone/10 hover:bg-stone/20">‹</button>
                    <button onClick={() => setContent({ ...content, rooms: move(content.rooms, i, 1) })} className="px-2 py-1 text-xs rounded-full bg-stone/10 hover:bg-stone/20">›</button>
                    <button
                      onClick={() => setContent({ ...content, rooms: content.rooms.filter((_, idx) => idx !== i) })}
                      className="px-2 py-1 text-xs rounded-full bg-red-50 text-red-400 hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  <div>
                    <label className={labelCls}>Key</label>
                    <input className={inputCls} value={room.key} onChange={(e) => updateRoom(i, { key: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Icon</label>
                    <input className={inputCls} value={room.icon} onChange={(e) => updateRoom(i, { icon: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Category</label>
                    <select className={inputCls} value={room.category} onChange={(e) => updateRoom(i, { category: e.target.value as Room["category"] })}>
                      <option value="pool">pool</option>
                      <option value="rooms">rooms</option>
                      <option value="common">common</option>
                      <option value="outdoor">outdoor</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Capacity</label>
                    <input className={inputCls} value={room.capacity ?? ""} onChange={(e) => updateRoom(i, { capacity: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={labelCls}>Label (EN)</label>
                    <input className={inputCls} value={room.labelEn} onChange={(e) => updateRoom(i, { labelEn: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Label (ES)</label>
                    <input className={inputCls} value={room.labelEs} onChange={(e) => updateRoom(i, { labelEs: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={labelCls}>Description (EN)</label>
                    <textarea rows={2} className={inputCls} value={room.descEn} onChange={(e) => updateRoom(i, { descEn: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Description (ES)</label>
                    <textarea rows={2} className={inputCls} value={room.descEs} onChange={(e) => updateRoom(i, { descEs: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Badge (EN)</label>
                    <input className={inputCls} value={room.badgeEn ?? ""} onChange={(e) => updateRoom(i, { badgeEn: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Badge (ES)</label>
                    <input className={inputCls} value={room.badgeEs ?? ""} onChange={(e) => updateRoom(i, { badgeEs: e.target.value })} />
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={() =>
                setContent({
                  ...content,
                  rooms: [
                    ...content.rooms,
                    { key: "new-room", category: "rooms", icon: "🛏️", capacity: "", badgeEn: "", badgeEs: "", labelEn: "New room", labelEs: "Nueva habitación", descEn: "", descEs: "", sortOrder: content.rooms.length },
                  ],
                })
              }
              className="self-start px-5 py-2.5 border border-dashed border-stone/30 text-[#6B7280] text-sm rounded-full hover:border-[#2D4A3E]/40 hover:text-[#2D4A3E]"
            >
              + Add room
            </button>
          </div>
        )}

        {tab === "Rates" && content && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-end">
              <button onClick={saveContent} disabled={saving} className="px-5 py-2.5 bg-[#2D4A3E] text-white text-sm rounded-full hover:bg-[#243D30] disabled:opacity-50">
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
            {content.rateTiers.map((tier, i) => (
              <div key={tier.id ?? i} className={cardCls}>
                <div className="flex justify-end gap-1 mb-3">
                  <button onClick={() => setContent({ ...content, rateTiers: move(content.rateTiers, i, -1) })} className="px-2 py-1 text-xs rounded-full bg-stone/10 hover:bg-stone/20">‹</button>
                  <button onClick={() => setContent({ ...content, rateTiers: move(content.rateTiers, i, 1) })} className="px-2 py-1 text-xs rounded-full bg-stone/10 hover:bg-stone/20">›</button>
                  <button
                    onClick={() => setContent({ ...content, rateTiers: content.rateTiers.filter((_, idx) => idx !== i) })}
                    className="px-2 py-1 text-xs rounded-full bg-red-50 text-red-400 hover:bg-red-100"
                  >
                    Delete
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={labelCls}>Season (EN)</label>
                    <input className={inputCls} value={tier.seasonEn} onChange={(e) => updateTier(i, { seasonEn: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Season (ES)</label>
                    <input className={inputCls} value={tier.seasonEs} onChange={(e) => updateTier(i, { seasonEs: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className={labelCls}>From (EN)</label>
                    <input className={inputCls} value={tier.fromEn} onChange={(e) => updateTier(i, { fromEn: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>From (ES)</label>
                    <input className={inputCls} value={tier.fromEs} onChange={(e) => updateTier(i, { fromEs: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Period (EN)</label>
                    <input className={inputCls} value={tier.periodEn} onChange={(e) => updateTier(i, { periodEn: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Period (ES)</label>
                    <input className={inputCls} value={tier.periodEs} onChange={(e) => updateTier(i, { periodEs: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Tag (EN)</label>
                    <input className={inputCls} value={tier.tagEn} onChange={(e) => updateTier(i, { tagEn: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Tag (ES)</label>
                    <input className={inputCls} value={tier.tagEs} onChange={(e) => updateTier(i, { tagEs: e.target.value })} />
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={() =>
                setContent({
                  ...content,
                  rateTiers: [
                    ...content.rateTiers,
                    { seasonEn: "", seasonEs: "", fromEn: "", fromEs: "", periodEn: "", periodEs: "", tagEn: "", tagEs: "", sortOrder: content.rateTiers.length },
                  ],
                })
              }
              className="self-start px-5 py-2.5 border border-dashed border-stone/30 text-[#6B7280] text-sm rounded-full hover:border-[#2D4A3E]/40 hover:text-[#2D4A3E]"
            >
              + Add rate tier
            </button>
          </div>
        )}

        {tab === "Amenities" && content && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-end">
              <button onClick={saveContent} disabled={saving} className="px-5 py-2.5 bg-[#2D4A3E] text-white text-sm rounded-full hover:bg-[#243D30] disabled:opacity-50">
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
            {content.amenities.map((item, i) => (
              <div key={item.id ?? i} className={cardCls}>
                <div className="flex justify-end gap-1 mb-3">
                  <button onClick={() => setContent({ ...content, amenities: move(content.amenities, i, -1) })} className="px-2 py-1 text-xs rounded-full bg-stone/10 hover:bg-stone/20">‹</button>
                  <button onClick={() => setContent({ ...content, amenities: move(content.amenities, i, 1) })} className="px-2 py-1 text-xs rounded-full bg-stone/10 hover:bg-stone/20">›</button>
                  <button
                    onClick={() => setContent({ ...content, amenities: content.amenities.filter((_, idx) => idx !== i) })}
                    className="px-2 py-1 text-xs rounded-full bg-red-50 text-red-400 hover:bg-red-100"
                  >
                    Delete
                  </button>
                </div>
                <div className="mb-3">
                  <label className={labelCls}>Icon (emoji, e.g. 🏊)</label>
                  <input className={inputCls} value={item.icon} onChange={(e) => updateAmenity(i, { icon: e.target.value })} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Title (EN)</label>
                    <input className={inputCls} value={item.titleEn} onChange={(e) => updateAmenity(i, { titleEn: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Title (ES)</label>
                    <input className={inputCls} value={item.titleEs} onChange={(e) => updateAmenity(i, { titleEs: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Description (EN)</label>
                    <textarea rows={2} className={inputCls} value={item.descEn} onChange={(e) => updateAmenity(i, { descEn: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Description (ES)</label>
                    <textarea rows={2} className={inputCls} value={item.descEs} onChange={(e) => updateAmenity(i, { descEs: e.target.value })} />
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={() =>
                setContent({
                  ...content,
                  amenities: [
                    ...content.amenities,
                    { icon: "pool", titleEn: "", titleEs: "", descEn: "", descEs: "", sortOrder: content.amenities.length },
                  ],
                })
              }
              className="self-start px-5 py-2.5 border border-dashed border-stone/30 text-[#6B7280] text-sm rounded-full hover:border-[#2D4A3E]/40 hover:text-[#2D4A3E]"
            >
              + Add amenity
            </button>
          </div>
        )}

        {tab === "Business" && content && (
          <div className="flex flex-col gap-6">
            <div className="flex justify-end">
              <button onClick={saveContent} disabled={saving} className="px-5 py-2.5 bg-[#2D4A3E] text-white text-sm rounded-full hover:bg-[#243D30] disabled:opacity-50">
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>

            {/* Identity */}
            <div className={cardCls}>
              <p className="text-xs uppercase tracking-[0.2em] text-[#6B7280] mb-4">Identity</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <div>
                  <label className={labelCls}>Business name</label>
                  <input
                    className={inputCls}
                    value={content.property.name}
                    onChange={(e) => setContent({ ...content, property: { ...content.property, name: e.target.value } })}
                  />
                </div>
                <div>
                  <label className={labelCls}>Logo</label>
                  <div className="flex items-center gap-3">
                    <div className="relative w-24 h-12 rounded-lg overflow-hidden bg-[#6B7280]/10 flex items-center justify-center shrink-0">
                      {content.property.logoUrl ? (
                        <Image src={content.property.logoUrl} alt="Logo" fill className="object-contain" unoptimized />
                      ) : (
                        <span className="text-xs text-[#6B7280]">No logo</span>
                      )}
                    </div>
                    <button
                      onClick={() => logoRef.current?.click()}
                      disabled={logoUploading}
                      className="px-3 py-1.5 text-xs rounded-full bg-[#8B6914]/10 text-[#8B6914] hover:bg-[#8B6914]/20 disabled:opacity-50"
                    >
                      {logoUploading ? "Uploading…" : "Upload"}
                    </button>
                    <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={uploadLogo} />
                    {content.property.logoUrl && (
                      <button onClick={removeLogo} className="px-3 py-1.5 text-xs rounded-full bg-red-50 text-red-400 hover:bg-red-100">
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Location */}
            <div className={cardCls}>
              <p className="text-xs uppercase tracking-[0.2em] text-[#6B7280] mb-4">Location</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div>
                  <label className={labelCls}>City</label>
                  <input className={inputCls} value={content.property.addressLocality} onChange={(e) => setContent({ ...content, property: { ...content.property, addressLocality: e.target.value } })} />
                </div>
                <div>
                  <label className={labelCls}>Region</label>
                  <input className={inputCls} value={content.property.addressRegion} onChange={(e) => setContent({ ...content, property: { ...content.property, addressRegion: e.target.value } })} />
                </div>
                <div>
                  <label className={labelCls}>Country (ISO-2, e.g. PE)</label>
                  <input className={inputCls} value={content.property.addressCountry} onChange={(e) => setContent({ ...content, property: { ...content.property, addressCountry: e.target.value } })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Latitude</label>
                  <input
                    type="number"
                    step="any"
                    className={inputCls}
                    value={content.property.latitude ?? ""}
                    onChange={(e) => setContent({ ...content, property: { ...content.property, latitude: e.target.value === "" ? null : Number(e.target.value) } })}
                  />
                </div>
                <div>
                  <label className={labelCls}>Longitude</label>
                  <input
                    type="number"
                    step="any"
                    className={inputCls}
                    value={content.property.longitude ?? ""}
                    onChange={(e) => setContent({ ...content, property: { ...content.property, longitude: e.target.value === "" ? null : Number(e.target.value) } })}
                  />
                </div>
              </div>
            </div>

            {/* SEO */}
            <div className={cardCls}>
              <p className="text-xs uppercase tracking-[0.2em] text-[#6B7280] mb-4">SEO</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className={labelCls}>Meta title (EN)</label>
                  <input className={inputCls} value={content.property.metaTitleEn} onChange={(e) => setContent({ ...content, property: { ...content.property, metaTitleEn: e.target.value } })} />
                </div>
                <div>
                  <label className={labelCls}>Meta title (ES)</label>
                  <input className={inputCls} value={content.property.metaTitleEs} onChange={(e) => setContent({ ...content, property: { ...content.property, metaTitleEs: e.target.value } })} />
                </div>
                <div>
                  <label className={labelCls}>Meta description (EN)</label>
                  <textarea rows={2} className={inputCls} value={content.property.metaDescriptionEn} onChange={(e) => setContent({ ...content, property: { ...content.property, metaDescriptionEn: e.target.value } })} />
                </div>
                <div>
                  <label className={labelCls}>Meta description (ES)</label>
                  <textarea rows={2} className={inputCls} value={content.property.metaDescriptionEs} onChange={(e) => setContent({ ...content, property: { ...content.property, metaDescriptionEs: e.target.value } })} />
                </div>
                <div>
                  <label className={labelCls}>Keywords (EN, comma-separated)</label>
                  <input
                    className={inputCls}
                    value={content.property.metaKeywordsEn.join(", ")}
                    onChange={(e) => setContent({ ...content, property: { ...content.property, metaKeywordsEn: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) } })}
                  />
                </div>
                <div>
                  <label className={labelCls}>Keywords (ES, comma-separated)</label>
                  <input
                    className={inputCls}
                    value={content.property.metaKeywordsEs.join(", ")}
                    onChange={(e) => setContent({ ...content, property: { ...content.property, metaKeywordsEs: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) } })}
                  />
                </div>
              </div>
            </div>

            {/* Details */}
            <div className={cardCls}>
              <p className="text-xs uppercase tracking-[0.2em] text-[#6B7280] mb-4">Details</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                <div>
                  <label className={labelCls}>Price range (e.g. $$)</label>
                  <input className={inputCls} value={content.property.priceRange} onChange={(e) => setContent({ ...content, property: { ...content.property, priceRange: e.target.value } })} />
                </div>
                <div>
                  <label className={labelCls}>Star rating</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    step="0.5"
                    className={inputCls}
                    value={content.property.starRating ?? ""}
                    onChange={(e) => setContent({ ...content, property: { ...content.property, starRating: e.target.value === "" ? null : Number(e.target.value) } })}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-[#1a1a1a] pb-2">
                  <input
                    type="checkbox"
                    checked={content.property.petsAllowed}
                    onChange={(e) => setContent({ ...content, property: { ...content.property, petsAllowed: e.target.checked } })}
                  />
                  Pets allowed
                </label>
              </div>
            </div>

            {/* Contact */}
            <div className={cardCls}>
              <p className="text-xs uppercase tracking-[0.2em] text-[#6B7280] mb-4">Contact</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>WhatsApp number (no +, e.g. 51963416766)</label>
                  <input
                    className={inputCls}
                    value={content.property.whatsappNumber}
                    onChange={(e) => setContent({ ...content, property: { ...content.property, whatsappNumber: e.target.value } })}
                  />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input
                    className={inputCls}
                    value={content.property.email}
                    onChange={(e) => setContent({ ...content, property: { ...content.property, email: e.target.value } })}
                  />
                </div>
                <div>
                  <label className={labelCls}>Maps URL</label>
                  <input
                    className={inputCls}
                    value={content.property.mapsUrl}
                    onChange={(e) => setContent({ ...content, property: { ...content.property, mapsUrl: e.target.value } })}
                  />
                </div>
                <div>
                  <label className={labelCls}>Airbnb listing URL</label>
                  <input
                    className={inputCls}
                    value={content.property.airbnbUrl}
                    onChange={(e) => setContent({ ...content, property: { ...content.property, airbnbUrl: e.target.value } })}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={labelCls}>WhatsApp message (EN)</label>
                  <textarea
                    rows={2}
                    className={inputCls}
                    value={content.property.whatsappMessageEn}
                    onChange={(e) => setContent({ ...content, property: { ...content.property, whatsappMessageEn: e.target.value } })}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={labelCls}>WhatsApp message (ES)</label>
                  <textarea
                    rows={2}
                    className={inputCls}
                    value={content.property.whatsappMessageEs}
                    onChange={(e) => setContent({ ...content, property: { ...content.property, whatsappMessageEs: e.target.value } })}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  function updateRoom(i: number, patch: Partial<Room>) {
    if (!content) return;
    setContent({ ...content, rooms: content.rooms.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  }

  function updateTier(i: number, patch: Partial<RateTier>) {
    if (!content) return;
    setContent({ ...content, rateTiers: content.rateTiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) });
  }

  function updateAmenity(i: number, patch: Partial<Amenity>) {
    if (!content) return;
    setContent({ ...content, amenities: content.amenities.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) });
  }
}
