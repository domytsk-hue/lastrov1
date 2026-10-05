"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { polar } from "@/lib/geometry";
import { duration, ease, spring } from "@/design-system/motion";

export interface OrbitDatum {
  id: string;
  label: string;
  /** 0..1 — how much of the segment glows (health / share). */
  value: number;
  /** Relative share of the ring this segment occupies. Defaults to equal. */
  weight?: number;
  color: string;
  /** Lighter end of the segment gradient. */
  colorTo?: string;
}

const SIZE = 400;
const C = SIZE / 2;
const R = 132; // ring centerline
const T_MIN = 16;
const T_MAX = 34;
const GAP_DEG = 7;
/** Scale SVG groups around the ring's center, not their own bounding boxes. */
const ORIGIN = { transformBox: "view-box", transformOrigin: "200px 200px" } as const;

/** Arc along the circle from a0 to a1 (degrees, 0 = top, clockwise). Reversed for bottom labels. */
function arc(r: number, a0: number, a1: number, reverse = false) {
  const p0 = polar(C, C, r, reverse ? a1 : a0);
  const p1 = polar(C, C, r, reverse ? a0 : a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${p0.x.toFixed(2)},${p0.y.toFixed(2)} A${r},${r} 0 ${large} ${reverse ? 0 : 1} ${p1.x.toFixed(2)},${p1.y.toFixed(2)}`;
}

/**
 * <Orbit /> — a circular financial system. Each segment is one dimension; its thickness and
 * glow follow its value. Labels travel along the ring. Tap a segment: it expands, the center
 * changes. Idle, the ring breathes almost imperceptibly.
 */
export function Orbit({
  data,
  selected,
  onSelect,
  center,
  className,
  startAngle = -90,
  breathe = true,
  mode = "health",
  ariaLabel,
}: {
  data: OrbitDatum[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  center: React.ReactNode;
  className?: string;
  startAngle?: number;
  breathe?: boolean;
  /** "health": value fills part of each segment. "share": segments are always full; value only sets thickness. */
  mode?: "health" | "share";
  ariaLabel: string;
}) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const total = data.reduce((s, d) => s + (d.weight ?? 1), 0);

  let cursor = startAngle + 90; // convert to our 0=top convention
  const segs = data.map((d) => {
    const span = ((d.weight ?? 1) / total) * 360;
    const a0 = cursor;
    cursor += span;
    const thickness = T_MIN + (T_MAX - T_MIN) * Math.max(0, Math.min(1, d.value));
    // Round caps extend past the arc ends — pull them in so gaps stay even.
    const capDeg = ((thickness / 2 / R) * 180) / Math.PI;
    const s0 = a0 + GAP_DEG / 2 + capDeg;
    const s1 = a0 + span - GAP_DEG / 2 - capDeg;
    const mid = a0 + span / 2;
    const norm = ((mid % 360) + 360) % 360;
    const bottom = norm > 100 && norm < 260;
    return { d, s0: Math.min(s0, a0 + span / 2 - 0.5), s1: Math.max(s1, a0 + span / 2 + 0.5), mid, thickness, bottom, span };
  });

  return (
    <div className={cn("relative mx-auto aspect-square w-full max-w-[420px]", className)}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 size-full overflow-visible" role="group" aria-label={ariaLabel}>
        <defs>
          {segs.map(({ d }) => (
            <linearGradient key={d.id} id={`${uid}-g-${d.id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={d.colorTo ?? d.color} />
              <stop offset="100%" stopColor={d.color} />
            </linearGradient>
          ))}
          <filter id={`${uid}-blur`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <radialGradient id={`${uid}-disc`} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#E6F3FF" />
          </radialGradient>
        </defs>

        {/* faint outer orbit with slowly travelling moons */}
        <circle cx={C} cy={C} r={R + T_MAX / 2 + 38} fill="none" stroke="rgba(23,61,145,0.10)" strokeDasharray="2 7" />
        {!reduce && (
          <motion.g animate={{ rotate: 360 }} transition={{ duration: 90, ease: "linear", repeat: Infinity }} style={ORIGIN}>
            {[20, 150, 260].map((a) => {
              const p = polar(C, C, R + T_MAX / 2 + 38, a);
              return <circle key={a} cx={p.x} cy={p.y} r={a === 150 ? 4 : 2.5} fill={a === 150 ? "#18E0AE" : "#65B7F2"} />;
            })}
          </motion.g>
        )}

        <motion.g
          style={ORIGIN}
          animate={breathe && !reduce && selected === null ? { scale: [1, 1.008, 1] } : { scale: 1 }}
          transition={breathe && !reduce && selected === null ? { duration: 4.5, repeat: Infinity, ease: "easeInOut" } : spring.soft}
        >
          {segs.map(({ d, s0, s1, mid, thickness, bottom }, i) => {
            const active = selected === d.id;
            const dim = selected !== null && !active;
            const labelR = R + T_MAX / 2 + 14 + (bottom ? 9 : 0);
            const labelId = `${uid}-l-${d.id}`;
            const select = () => onSelect(active ? null : d.id);
            return (
              <motion.g
                key={d.id}
                role="button"
                tabIndex={0}
                aria-pressed={active}
                aria-label={mode === "share" ? `${d.label}: ${Math.round(((d.weight ?? 1) / total) * 100)}%` : `${d.label}: ${Math.round(d.value * 100)}%`}
                onClick={select}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    select();
                  }
                }}
                className="cursor-pointer outline-none"
                style={ORIGIN}
                animate={{ scale: active ? 1.045 : 1, opacity: dim ? 0.42 : 1 }}
                whileHover={reduce ? undefined : { scale: active ? 1.045 : 1.02 }}
                transition={spring.soft}
              >
                {/* track */}
                <path d={arc(R, s0, s1)} fill="none" stroke="rgba(23,61,145,0.08)" strokeWidth={thickness} strokeLinecap="round" />
                {/* value */}
                <motion.path
                  d={arc(R, s0, s1)}
                  fill="none"
                  stroke={`url(#${uid}-g-${d.id})`}
                  strokeWidth={thickness}
                  strokeLinecap="round"
                  initial={reduce ? false : { pathLength: 0 }}
                  animate={{ pathLength: mode === "share" ? 1 : Math.max(0.02, Math.min(1, d.value)) }}
                  transition={{ duration: duration.reveal, delay: reduce ? 0 : 0.15 + i * 0.09, ease: ease.out }}
                />
                {/* generous hit area */}
                <path d={arc(R, s0 - 2, s1 + 2)} fill="none" stroke="transparent" strokeWidth={T_MAX + 26} />
                {/* label travelling along the orbit */}
                <path id={labelId} d={arc(labelR, mid - 40, mid + 40, bottom)} fill="none" />
                <text
                  className="font-sans"
                  fontSize={active ? 14 : 12.5}
                  fontWeight={active ? 700 : 600}
                  letterSpacing="0.06em"
                  fill={active ? "#081525" : "#4F6A8E"}
                  style={{ transition: "fill 200ms, font-size 200ms" }}
                >
                  <textPath href={`#${labelId}`} startOffset="50%" textAnchor="middle">
                    {d.label.toUpperCase()}
                  </textPath>
                </text>
                {/* focus ring for keyboard users */}
                <path d={arc(R, s0, s1)} fill="none" stroke="transparent" strokeWidth={thickness + 8} strokeLinecap="round" className="[g:focus-visible>&]:stroke-electric/40" />
                <title>{d.label}</title>
              </motion.g>
            );
          })}
        </motion.g>

        {/* center disc */}
        <circle cx={C} cy={C + 10} r={R - T_MAX / 2 - 16} fill="rgba(22,80,180,0.16)" filter={`url(#${uid}-blur)`} />
        <circle cx={C} cy={C} r={R - T_MAX / 2 - 14} fill={`url(#${uid}-disc)`} />
        <circle cx={C} cy={C} r={R - T_MAX / 2 - 14} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" />
      </svg>
      <div className="pointer-events-none absolute inset-[27%] grid place-items-center text-center">
        <div className="pointer-events-auto">{center}</div>
      </div>
    </div>
  );
}
