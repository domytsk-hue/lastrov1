import { ImageResponse } from "next/og";
import { annularSector } from "@/lib/geometry";

export const alt = "Lastro — Sua vida financeira, finalmente visível";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The Lastro mark's segments: center angle, span, inner radius (see LastroMark). */
const MARK: [number, number, number][] = [[180, 62, 9.7], [118.5, 51, 10.6], [241.5, 51, 10.6], [62, 52, 10.8], [298, 52, 10.8], [0, 58, 10.9]];

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
          <svg width="56" height="56" viewBox="0 0 32 32">
            {MARK.map(([at, span, r0], i) => (
              <path key={at} d={annularSector(16, 16, r0 + 0.5, 13.5, at - span / 2 + 2.4, at + span / 2 - 2.4)} fill={i === 0 ? "#00E4B4" : "#ffffff"} stroke={i === 0 ? "#00E4B4" : "#ffffff"} strokeWidth={1} strokeLinejoin="round" />
            ))}
          </svg>
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
