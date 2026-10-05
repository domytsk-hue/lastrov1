"use client";

import { motion, useReducedMotion } from "framer-motion";
import { annularSector } from "@/lib/geometry";

/**
 * The Lastro mark: a ring of six segments — the six pillars of the Lastro score —
 * that get heavier towards the bottom. A foundation you can recognise without the word.
 *
 * Works as app icon, favicon, nav mark, loader (`loading`) and progress symbol (`progress`).
 */
const SEGMENTS = [
  // center angle (0 = top, clockwise), inner radius
  { at: 180, r0: 7.2 }, // bottom — the heaviest
  { at: 120, r0: 8.6 },
  { at: 240, r0: 8.6 },
  { at: 60, r0: 10.2 },
  { at: 300, r0: 10.2 },
  { at: 0, r0: 11.4 }, // top — the lightest
];
const R1 = 14;
const SPAN = 50;

export function LastroMark({
  size = 28,
  loading = false,
  progress,
  accent = "var(--color-green)",
  className,
  title = "Lastro",
}: {
  size?: number;
  loading?: boolean;
  /** 0..1 — fills segments bottom-up, like the score. */
  progress?: number;
  accent?: string;
  className?: string;
  title?: string;
}) {
  const reduce = useReducedMotion();
  const filled = progress === undefined ? SEGMENTS.length : Math.round(progress * SEGMENTS.length);
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} role="img" aria-label={title}>
      {SEGMENTS.map((s, i) => {
        const d = annularSector(16, 16, s.r0, R1, s.at - SPAN / 2, s.at + SPAN / 2);
        const on = i < filled;
        const fill = i === 0 ? accent : on ? "var(--color-off)" : "rgba(255,255,255,0.14)";
        if (loading && !reduce) {
          return (
            <motion.path
              key={i}
              d={d}
              fill={fill}
              initial={{ opacity: 0.15 }}
              animate={{ opacity: [0.15, 1, 1, 0.15] }}
              transition={{ duration: 1.8, times: [0, 0.25, 0.7, 1], repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
            />
          );
        }
        return <path key={i} d={d} fill={fill} />;
      })}
    </svg>
  );
}

export function LastroWordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="flex items-center gap-2">
        <LastroMark size={26} />
        <span className="font-display text-[19px] font-semibold tracking-[-0.03em]">lastro</span>
      </span>
    </span>
  );
}

/** Full-screen loader, shown while local data hydrates. */
export function LastroLoader() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink" aria-busy="true" aria-label="Carregando Lastro">
      <LastroMark size={56} loading />
    </div>
  );
}
