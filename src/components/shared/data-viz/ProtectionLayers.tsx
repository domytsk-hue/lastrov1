"use client";

import { motion, useReducedMotion } from "framer-motion";
import { duration, ease } from "@/design-system/motion";

/**
 * <ProtectionLayers /> — the emergency reserve as rings of protection around a center.
 * Each month of reserve adds a complete layer; the current month is a partial arc.
 * Months still missing (up to the target) are drawn as faint dashed orbits.
 */
export function ProtectionLayers({
  months,
  target,
  size = 300,
  children,
  compact = false,
}: {
  months: number;
  target: number;
  size?: number;
  children?: React.ReactNode;
  compact?: boolean;
}) {
  const reduce = useReducedMotion();
  const layers = Math.max(target, Math.ceil(months));
  const c = 150;
  const inner = compact ? 54 : 62;
  const outer = 142;
  const step = (outer - inner) / layers;
  const stroke = Math.max(4, step * (compact ? 0.48 : 0.62));

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 300 300" width={size} height={size} aria-hidden className="overflow-visible">
        <defs>
          <linearGradient id="layer-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#18E0AE" />
            <stop offset="100%" stopColor="#3678F5" />
          </linearGradient>
        </defs>
        {Array.from({ length: layers }, (_, i) => {
          const r = inner + step * (i + 0.5);
          const fill = Math.max(0, Math.min(1, months - i));
          const beyond = i >= target;
          return (
            <g key={i} transform={`rotate(-90 ${c} ${c})`}>
              <circle cx={c} cy={c} r={r} fill="none" stroke={fill > 0 ? "rgba(54,120,245,0.10)" : "rgba(23,61,145,0.12)"} strokeWidth={fill > 0 ? stroke : 1.5} strokeDasharray={fill > 0 ? undefined : "2 6"} />
              {fill > 0 && (
                <motion.circle
                  cx={c}
                  cy={c}
                  r={r}
                  fill="none"
                  stroke={beyond ? "#FFC234" : "url(#layer-grad)"}
                  strokeOpacity={0.45 + 0.55 * ((i + 1) / layers)}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  initial={reduce ? false : { pathLength: 0 }}
                  animate={{ pathLength: fill }}
                  transition={{ duration: duration.reveal, delay: reduce ? 0 : 0.15 + i * 0.12, ease: ease.out }}
                />
              )}
            </g>
          );
        })}
        <circle cx={c} cy={c} r={inner - 6} fill="white" />
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center text-center">{children}</div>}
    </div>
  );
}
