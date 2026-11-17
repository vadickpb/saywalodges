import { ImageResponse } from "next/og";

export const alt = "HostStay — Todo tu negocio de alquileres vacacionales, en un solo lugar";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "linear-gradient(135deg, #0B1F33 0%, #12385F 70%, #0D6F68 100%)",
        color: "white",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        padding: "78px",
        position: "relative",
        width: "100%",
      }}
    >
      <div style={{ border: "1px solid rgba(255,255,255,.16)", borderRadius: 44, display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "68px", width: "100%" }}>
        <div style={{ alignItems: "center", display: "flex" }}>
          <div style={{ alignItems: "center", border: "4px solid #14B8A6", borderRadius: 16, display: "flex", fontSize: 30, fontWeight: 800, height: 68, justifyContent: "center", marginRight: 24, width: 68 }}>HS</div>
          <span style={{ fontSize: 58, fontWeight: 800, letterSpacing: "-2px" }}>Host</span>
          <span style={{ color: "#39D5C4", fontSize: 58, fontWeight: 800, letterSpacing: "-2px" }}>Stay</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ color: "#70E4D7", fontSize: 22, fontWeight: 700, letterSpacing: "4px", marginBottom: 20, textTransform: "uppercase" }}>Software para anfitriones</div>
          <div style={{ fontSize: 54, fontWeight: 800, letterSpacing: "-1.5px", lineHeight: 1.08, maxWidth: 920 }}>Todo tu negocio de alquileres vacacionales, en un solo lugar.</div>
        </div>
      </div>
    </div>,
    size,
  );
}
