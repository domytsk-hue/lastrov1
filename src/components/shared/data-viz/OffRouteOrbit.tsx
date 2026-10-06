"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { polar } from "@/lib/geometry";
import { color } from "@/design-system/colors";
import { duration, ease } from "@/design-system/motion";

/**
 * <OffRouteOrbit /> — the Lastro Orbit, one segment off its path. Used by the 404 page.
 *
 * Same geometry and gradients as <Orbit />: the ring assembles, then one segment drifts a
 * little out of its slot and gently returns, while a dashed trace marks where it belongs.
 * Purely decorative (aria-hidden); the page's heading carries the message.
 */

const SIZE = 400;
const C = SIZE / 2;
const R = 132;
const T = 26;
const GAP_DEG = 9;
const ORIGIN = { transformBox: "view-box", transformOrigin: "200px 200px" } as const;

/** Six segments, top first, clockwise. `off` is the one that left the route. */
const SEGMENTS = [
  { from: color.sky, to: color.electric },
  { from: color.blueSoft, to: color.deep },
  { from: color.sky, to: color.electric },
  { from: color.mint, to: color.mint, off: true },
  { from: color.blueSoft, to: color.deep },
  { from: color.sky, to: color.electric },
];

/** Where the drifting segment goes: outwards along its own radius, slightly turned. */
const DRIFT = { out: 44, turn: 7 };

function arc(r: number, a0: number, a1: number) {
  const p0 = polar(C, C, r, a0);
  const p1 = polar(C, C, r, a1);
  return `M${p0.x.toFixed(2)},${p0.y.toFixed(2)} A${r},${r} 0 0 1 ${p1.x.toFixed(2)},${p1.y.toFixed(2)}`;
}

export function OffRouteOrbit({ className, children }: { className?: string; children?: React.ReactNode }) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const span = 360 / SEGMENTS.length;
  const capDeg = ((T / 2 / R) * 180) / Math.PI;

  const segs = SEGMENTS.map((s, i) => {
    const a0 = i * span - span / 2 + GAP_DEG / 2 + capDeg;
    const a1 = (i + 1) * span - span / 2 - GAP_DEG / 2 - capDeg;
    return { ...s, i, a0, a1, mid: i * span };
  });
  const off = segs.find((s) => s.off)!;
  // Unit vector pointing out of the ring through the drifting segment's middle.
  const dir = { x: Math.sin((off.mid * Math.PI) / 180), y: -Math.cos((off.mid * Math.PI) / 180) };
  const drifted = { x: dir.x * DRIFT.out, y: dir.y * DRIFT.out, rotate: DRIFT.turn };
  const assembled = 0.25 + segs.length * 0.09 + duration.reveal; // when the ring is complete

  return (
    <div aria-hidden className={cn("relative mx-auto aspect-square w-full", className)}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 size-full overflow-visible">
        <defs>
          {segs.map((s) => (
            <linearGradient key={s.i} id={`${uid}-g-${s.i}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" style={{ stopColor: s.from }} />
              <stop offset="100%" style={{ stopColor: s.to }} />
            </linearGradient>
          ))}
          <filter id={`${uid}-blur`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <radialGradient id={`${uid}-disc`} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#E6F3FF" />
          </radialGradient>
        </defs>

        {/* the expected route: a faint dotted orbit */}
        <circle cx={C} cy={C} r={R + T / 2 + 34} fill="none" stroke="rgba(23,61,145,0.10)" strokeDasharray="2 7" />

        {/* the empty slot: its track stays, and a thin dotted rail "searches" for the segment */}
        <path d={arc(R, off.a0, off.a1)} fill="none" stroke="rgba(23,61,145,0.08)" strokeWidth={T} strokeLinecap="round" />
        <motion.path
          d={arc(R, off.a0 - capDeg, off.a1 + capDeg)}
          fill="none"
          stroke={color.mintInk}
          strokeOpacity={0.7}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray="0.5 9"
          initial={reduce ? false : { opacity: 0 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, strokeDashoffset: [0, -19] }}
          transition={reduce ? undefined : { opacity: { delay: assembled, duration: duration.slow }, strokeDashoffset: { duration: 1.6, repeat: Infinity, ease: "linear" } }}
        />

        {segs.map((s) => {
          const path = arc(R, s.a0, s.a1);
          const reveal = { duration: duration.reveal, delay: reduce ? 0 : 0.25 + s.i * 0.09, ease: ease.out };
          if (!s.off) {
            return (
              <g key={s.i}>
                <path d={path} fill="none" stroke="rgba(23,61,145,0.08)" strokeWidth={T} strokeLinecap="round" />
                <motion.path
                  d={path}
                  fill="none"
                  stroke={`url(#${uid}-g-${s.i})`}
                  strokeWidth={T}
                  strokeLinecap="round"
                  initial={reduce ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={reveal}
                />
              </g>
            );
          }
          // The segment that left the route: assembles in place, then drifts out and back.
          return (
            <motion.g
              key={s.i}
              style={ORIGIN}
              initial={reduce ? false : { x: 0, y: 0, rotate: 0 }}
              animate={
                reduce
                  ? drifted
                  : { x: [0, drifted.x, drifted.x * 0.55, drifted.x], y: [0, drifted.y, drifted.y * 0.55, drifted.y], rotate: [0, drifted.rotate, drifted.rotate * 0.55, drifted.rotate] }
              }
              transition={reduce ? undefined : { delay: assembled + 0.2, duration: 7, times: [0, 0.3, 0.65, 1], ease: ease.inOut, repeat: Infinity, repeatType: "mirror", repeatDelay: 0.6 }}
            >
              <path d={path} fill="none" stroke={color.mint} strokeOpacity={0.45} strokeWidth={T} strokeLinecap="round" filter={`url(#${uid}-glow)`} />
              <motion.path
                d={path}
                fill="none"
                stroke={`url(#${uid}-g-${s.i})`}
                strokeWidth={T}
                strokeLinecap="round"
                initial={reduce ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={reveal}
              />
            </motion.g>
          );
        })}

        {/* center disc, as in <Orbit /> */}
        <circle cx={C} cy={C + 10} r={R - T / 2 - 18} fill="rgba(22,80,180,0.16)" filter={`url(#${uid}-blur)`} />
        <circle cx={C} cy={C} r={R - T / 2 - 16} fill={`url(#${uid}-disc)`} />
        <circle cx={C} cy={C} r={R - T / 2 - 16} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" />
      </svg>
      {children && <div className="absolute inset-[28%] grid place-items-center text-center">{children}</div>}
    </div>
  );
}
