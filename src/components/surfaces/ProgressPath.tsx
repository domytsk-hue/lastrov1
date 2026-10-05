"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { duration, ease } from "@/lib/motion";

/** ─────●──── a gently curved path with a knot that travels to the current progress. */
export function ProgressPath({ value, color = "#3678F5", track = "rgba(23,61,145,0.12)", height = 28, knot = "#081525" }: { value: number; color?: string; track?: string; height?: number; knot?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<SVGPathElement>(null);
  const [pt, setPt] = useState<{ x: number; y: number } | null>(null);
  const v = Math.max(0, Math.min(1, value));
  const W = 300;
  const H = height;
  const d = `M6,${H / 2} C${W * 0.3},${H * 0.05} ${W * 0.45},${H * 0.95} ${W * 0.62},${H / 2} S${W * 0.88},${H * 0.15} ${W - 6},${H / 2}`;

  useEffect(() => {
    const p = ref.current;
    if (!p) return;
    const len = p.getTotalLength();
    const target = p.getPointAtLength(len * v);
    if (reduce) {
      setPt({ x: target.x, y: target.y });
      return;
    }
    // Move the knot along the path in step with the stroke animation.
    let raf = 0;
    const start = performance.now();
    const total = duration.reveal * 1000;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start - 150) / total);
      const eased = t <= 0 ? 0 : 1 - Math.pow(1 - t, 3);
      const q = p.getPointAtLength(len * v * eased);
      setPt({ x: q.x, y: q.y });
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [v, reduce]);

  return (
    <div className="relative" style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full overflow-visible" preserveAspectRatio="none" aria-hidden>
        <path d={d} fill="none" stroke={track} strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <motion.path ref={ref} d={d} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: Math.max(0.005, v) }} transition={{ duration: duration.reveal, ease: ease.out, delay: 0.15 }} />
      </svg>
      {/* HTML knot stays round however the path stretches */}
      {pt && (
        <span
          aria-hidden
          className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-white shadow-[0_4px_10px_-2px_rgba(7,26,59,0.35)]"
          style={{ left: `${(pt.x / W) * 100}%`, top: `${(pt.y / H) * 100}%`, borderColor: knot }}
        />
      )}
    </div>
  );
}
