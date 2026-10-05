"use client";

import { motion, useReducedMotion } from "framer-motion";
import { annularSector } from "@/lib/geometry";

/**
 * The Lastro mark: a ring of six rounded segments — the six pillars of the Lastro score —
 * with the foundation (bottom) in mint and slightly heavier. A base you can recognise
 * without the word.
 *
 * Works as app icon, favicon, nav mark, loader (`loading`) and progress symbol (`progress`).
 */
const SEGMENTS = [
  // center angle (0 = top, clockwise), angular span, inner radius — measured from the logo artwork
  { at: 180, span: 62, r0: 9.7 }, // bottom — the foundation
  { at: 118.5, span: 51, r0: 10.6 },
  { at: 241.5, span: 51, r0: 10.6 },
  { at: 62, span: 52, r0: 10.8 },
  { at: 298, span: 52, r0: 10.8 },
  { at: 0, span: 58, r0: 10.9 }, // top
];
const R1 = 14;
/** Corner rounding: the sector is inset by half of this and stroked with round joins. */
const ROUND = 1;
const INSET_DEG = ((ROUND / 2 / 12) * 180) / Math.PI;

export const LASTRO_INK = "#0E0E17";
export const LASTRO_MINT = "#00E4B4";

export function LastroMark({
  size = 28,
  loading = false,
  progress,
  accent = LASTRO_MINT,
  tone = "dark",
  className,
  title = "Lastro",
}: {
  size?: number;
  loading?: boolean;
  /** 0..1 — fills segments bottom-up, like the score. */
  progress?: number;
  accent?: string;
  /** "dark" for light backgrounds (default), "light" for blue/navy surfaces. */
  tone?: "dark" | "light";
  className?: string;
  title?: string;
}) {
  const reduce = useReducedMotion();
  const filled = progress === undefined ? SEGMENTS.length : Math.round(progress * SEGMENTS.length);
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} role="img" aria-label={title}>
      {SEGMENTS.map((s, i) => {
        const half = s.span / 2 - INSET_DEG;
        const d = annularSector(16, 16, s.r0 + ROUND / 2, R1 - ROUND / 2, s.at - half, s.at + half);
        const on = i < filled;
        const ink = tone === "dark" ? LASTRO_INK : "#ffffff";
        const off = tone === "dark" ? "rgba(14,14,23,0.14)" : "rgba(255,255,255,0.22)";
        const fill = i === 0 ? accent : on ? ink : off;
        if (loading && !reduce) {
          return (
            <motion.path
              key={i}
              d={d}
              fill={fill}
              stroke={fill}
              strokeWidth={ROUND}
              strokeLinejoin="round"
              initial={{ opacity: 0.15 }}
              animate={{ opacity: [0.15, 1, 1, 0.15] }}
              transition={{ duration: 1.8, times: [0, 0.25, 0.7, 1], repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
            />
          );
        }
        return <path key={i} d={d} fill={fill} stroke={fill} strokeWidth={ROUND} strokeLinejoin="round" />;
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-env" aria-busy="true" aria-label="Carregando Lastro">
      <LastroMark size={56} loading />
    </div>
  );
}
