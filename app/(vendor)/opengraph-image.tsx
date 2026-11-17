import { ImageResponse } from "next/og";

export const alt = "HostStay — Todo tu negocio de alquileres vacacionales, en un solo lugar";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "linear-gradient(135deg, #0C1A22 0%, #163640 70%, #0D6F68 100%)",
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
          <svg width="68" height="68" viewBox="0 0 64 64" style={{ marginRight: 24 }}>
            <path d="M8 29 32 8l24 21v27H39V39H25v17H8Z" fill="none" stroke="#2DD4BF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: 58, fontWeight: 800, letterSpacing: "-2px" }}>Host</span>
          <span style={{ color: "#2DD4BF", fontSize: 58, fontWeight: 800, letterSpacing: "-2px" }}>Stay</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ color: "#2DD4BF", fontSize: 22, fontWeight: 700, letterSpacing: "4px", marginBottom: 20, textTransform: "uppercase" }}>Software para anfitriones</div>
          <div style={{ fontSize: 54, fontWeight: 800, letterSpacing: "-1.5px", lineHeight: 1.08, maxWidth: 920 }}>Gestiona tu casa, tus reservas y tus ganancias, en un solo lugar.</div>
        </div>
      </div>
    </div>,
    size,
  );
}
