"use client";

import { motion, useReducedMotion } from "framer-motion";
import { polar } from "@/lib/geometry";
import { duration, ease } from "@/design-system/motion";

/**
 * A curved progress surface (a 240° arc). The fill is what's been used; the small notch
 * marks where the month is today — so "ahead" or "behind" is visible without numbers.
 */
export function CurvedGauge({
  value,
  marker,
  size = 120,
  color = "url(#gauge-fill)",
  label,
}: {
  value: number;
  marker?: number;
  size?: number;
  color?: string;
  label?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const c = 60;
  const r = 46;
  const a0 = -120;
  const a1 = 120;
  const p0 = polar(c, c, r, a0);
  const p1 = polar(c, c, r, a1);
  const d = `M${p0.x},${p0.y} A${r},${r} 0 1 1 ${p1.x},${p1.y}`;
  const v = Math.max(0, Math.min(1, value));
  const m = marker !== undefined ? polar(c, c, r, a0 + (a1 - a0) * Math.max(0, Math.min(1, marker))) : null;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id="gauge-fill" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#173D91" />
            <stop offset="100%" stopColor="#65B7F2" />
          </linearGradient>
        </defs>
        <path d={d} fill="none" stroke="rgba(23,61,145,0.08)" strokeWidth="14" strokeLinecap="round" />
        {v > 0.005 && <motion.path d={d} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: Math.max(0.01, v) }} transition={{ duration: duration.reveal, ease: ease.out, delay: 0.2 }} />}
        {m && <circle cx={m.x} cy={m.y} r="4.5" fill="#fff" stroke="#081525" strokeWidth="2.5" />}
      </svg>
      <div className="absolute inset-0 grid place-items-center pt-1 text-center">
        {label ?? (
          <span className="font-display text-[22px] leading-none font-semibold text-ink-900 tabular">
            {Math.round(v * 100)}
            <span className="text-[12px] text-ink-500">%</span>
          </span>
        )}
      </div>
    </div>
  );
}
