import { ImageResponse } from "next/og";

export const alt = "Lastro — Sua vida financeira, finalmente visível";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social preview in the Lastro palette (tokens: ice, electric, deep, mint). */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "radial-gradient(120% 90% at 0% 0%, #8ccbff 0%, #4f9ff8 30%, #3678f5 58%, #173d91 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 44, height: 44, borderRadius: 999, border: "9px solid white", borderBottomColor: "#18E0AE" }} />
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1.5 }}>lastro</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.02, letterSpacing: -3, maxWidth: 900 }}>Veja sua vida financeira ganhar forma.</div>
          <div style={{ marginTop: 26, fontSize: 32, opacity: 0.85 }}>Gastos, metas, reserva e patrimônio — em uma visão clara.</div>
        </div>
      </div>
    ),
    size,
  );
}
