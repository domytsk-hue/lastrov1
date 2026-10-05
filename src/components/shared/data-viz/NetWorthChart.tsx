"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import { formatBRL, formatCompactBRL, monthName } from "@/lib/format";
import { smoothPath } from "@/lib/geometry";
import { usePrivacy } from "@/components/shared/ui/privacy";

/** Chart inputs: plain data, so the product (real data) and marketing (demo data) can both use it. */
export interface NetWorthPoint {
  month: string; // YYYY-MM
  value: number;
}
export interface Milestone {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
}

/**
 * Net worth over time — the most satisfying chart in Lastro.
 * Minimal axes, direct labels, milestones on the line, scrub to read any month.
 */
export function NetWorthChart({
  series,
  milestones = [],
  height = 200,
}: {
  series: NetWorthPoint[];
  milestones?: Milestone[];
  height?: number;
}) {
  const reduce = useReducedMotion();
  const privacy = usePrivacy();
  const ref = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const W = 600;
  const H = height;
  const PAD_T = 28;
  const PAD_B = 26;

  const enough = series.length >= 2;
  const geo = useMemo(() => {
    if (series.length < 2) return { pts: [{ x: W / 2, y: H / 2 }], line: "", area: "", ms: [] as (Milestone & { idx: number; x: number; y: number })[] };
    const vals = series.map((p) => p.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = Math.max(1, max - min);
    const lo = min - span * 0.15;
    const hi = max + span * 0.08;
    const x = (i: number) => (series.length === 1 ? W / 2 : (i / (series.length - 1)) * (W - 24) + 12);
    const y = (v: number) => PAD_T + (1 - (v - lo) / (hi - lo)) * (H - PAD_T - PAD_B);
    const pts = series.map((p, i) => ({ x: x(i), y: y(p.value) }));
    const line = smoothPath(pts);
    const area = `${line} L${pts[pts.length - 1].x},${H - PAD_B} L${pts[0].x},${H - PAD_B} Z`;
    const ms = milestones
      .map((m) => {
        const idx = series.findIndex((p) => p.month === m.date.slice(0, 7));
        return idx >= 0 ? { ...m, idx, ...pts[idx] } : null;
      })
      .filter(Boolean) as (Milestone & { idx: number; x: number; y: number })[];
    return { pts, line, area, ms };
  }, [series, milestones, H]);

  const onMove = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const rel = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    geo.pts.forEach((p, i) => {
      if (Math.abs(p.x - rel) < Math.abs(geo.pts[best].x - rel)) best = i;
    });
    setActive(best);
  };

  if (!enough) {
    return (
      <div className="grid place-items-center rounded-[28px] bg-ink-900/[0.03] px-6 text-center" style={{ height }}>
        <p className="max-w-xs text-[15px] text-ink-500">Seu gráfico de patrimônio começa a se desenhar a partir do segundo mês de uso.</p>
      </div>
    );
  }

  const last = geo.pts.length - 1;
  const shown = active ?? last;
  const p = geo.pts[shown];
  const ms = geo.ms.find((m) => m.idx === shown);

  return (
    <div className="relative select-none">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y overflow-visible"
        preserveAspectRatio="none"
        style={{ height }}
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerDown={(e) => onMove(e.clientX)}
        onPointerLeave={() => setActive(null)}
        role="img"
        aria-label={`Patrimônio: de ${formatBRL(series[0].value, { cents: false })} em ${monthName(series[0].month)} para ${formatBRL(series[last].value, { cents: false })} hoje`}
      >
        <defs>
          <linearGradient id="nw-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#3678F5" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#3678F5" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="nw-line" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#8CCBFF" />
            <stop offset="60%" stopColor="#3678F5" />
            <stop offset="100%" stopColor="#18E0AE" />
          </linearGradient>
        </defs>

        {[0.33, 0.66].map((f) => (
          <line key={f} x1="0" x2={W} y1={PAD_T + f * (H - PAD_T - PAD_B)} y2={PAD_T + f * (H - PAD_T - PAD_B)} stroke="transparent" vectorEffect="non-scaling-stroke" />
        ))}

        <motion.path d={geo.area} fill="url(#nw-area)" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.4 }} />
        <motion.path
          d={geo.line}
          fill="none"
          stroke="url(#nw-line)"
          strokeWidth="3.5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        />

        {active !== null && <line x1={p.x} x2={p.x} y1={PAD_T - 8} y2={H - PAD_B} stroke="rgba(23,61,145,0.18)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />}
      </svg>

      {/* HTML overlays keep dots round and text crisp despite preserveAspectRatio="none". */}
      <div className="pointer-events-none absolute inset-0">
        {geo.ms.map((m) => (
          <span
            key={m.id}
            className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-amber"
            style={{ left: `${(m.x / W) * 100}%`, top: m.y }}
            aria-hidden
          />
        ))}
        <span
          className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-mint shadow-[0_0_0_6px_rgba(24,224,174,0.22)] transition-[left,top] duration-150"
          style={{ left: `${(p.x / W) * 100}%`, top: p.y }}
          aria-hidden
        />
        <div
          className="absolute -translate-x-1/2 rounded-full bg-midnight px-3 py-1.5 text-center whitespace-nowrap shadow-[0_10px_24px_-10px_rgba(7,26,59,0.7)] transition-[left] duration-150"
          style={{ left: `clamp(48px, ${(p.x / W) * 100}%, calc(100% - 48px))`, top: Math.max(0, p.y - 56) }}
        >
          <p className="text-[13px] font-semibold tabular text-white">{privacy ? "R$ ••••" : formatCompactBRL(series[shown].value)}</p>
          <p className="text-[10px] font-medium text-white/60 uppercase">{shown === last ? "hoje" : `${monthName(series[shown].month, true)} ${series[shown].month.slice(2, 4)}`}</p>
        </div>
        {ms && <p className="absolute right-0 bottom-0 left-0 text-center text-[12px] font-semibold text-amber-ink">★ {ms.title}</p>}
      </div>

      <div className="mt-2 flex justify-between text-[12px] font-semibold text-ink-400 uppercase" aria-hidden>
        <span>
          {monthName(series[0].month, true)} {series[0].month.slice(2, 4)}
        </span>
        <span>
          {monthName(series[Math.floor(last / 2)].month, true)} {series[Math.floor(last / 2)].month.slice(2, 4)}
        </span>
        <span>hoje</span>
      </div>
    </div>
  );
}
