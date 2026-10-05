/** Point on a circle. Angles in degrees, 0 = 12 o'clock, clockwise. */
export function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** SVG path for a ring segment (annular sector) between radii r0 < r1 and angles a0 < a1. */
export function annularSector(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const large = a1 - a0 > 180 ? 1 : 0;
  const p0 = polar(cx, cy, r1, a0);
  const p1 = polar(cx, cy, r1, a1);
  const p2 = polar(cx, cy, r0, a1);
  const p3 = polar(cx, cy, r0, a0);
  const f = (n: number) => n.toFixed(3);
  return [
    `M${f(p0.x)},${f(p0.y)}`,
    `A${r1},${r1} 0 ${large} 1 ${f(p1.x)},${f(p1.y)}`,
    `L${f(p2.x)},${f(p2.y)}`,
    `A${r0},${r0} 0 ${large} 0 ${f(p3.x)},${f(p3.y)}`,
    "Z",
  ].join(" ");
}

/** Smooth path through points (monotone-ish cubic), for line charts. */
export function smoothPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return "";
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const t = 0.18;
    const c1 = { x: p1.x + (p2.x - p0.x) * t, y: p1.y + (p2.y - p0.y) * t };
    const c2 = { x: p2.x - (p3.x - p1.x) * t, y: p2.y - (p3.y - p1.y) * t };
    d += ` C${c1.x.toFixed(2)},${c1.y.toFixed(2)} ${c2.x.toFixed(2)},${c2.y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}
