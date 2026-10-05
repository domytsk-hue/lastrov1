"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { lastroLevel, lastroScore, type Pillar, type PillarId } from "@/lib/finance";
import { addDays, formatNumber } from "@/lib/format";
import { annularSector, polar } from "@/lib/geometry";
import { useFinance } from "@/store/finance-store";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

/* Geometry of the Lastro: six sectors (pillars), seven strata each. */
const RINGS = 7;
const R_START = 58;
const RING = 10.5;
const RING_GAP = 3;
const CENTER = 160;
const SECTOR_ORDER: PillarId[] = ["investimentos", "metas", "fluxo", "reserva", "orcamento", "dividas"];

function sectorAngles(index: number, r: number) {
  const center = index * 60;
  // Constant ~3px physical gap between sectors, whatever the radius.
  const gapDeg = ((3 / r) * 180) / Math.PI + 1.5;
  return [center - 30 + gapDeg / 2, center + 30 - gapDeg / 2] as const;
}

export function LastroViz({
  pillars,
  previous,
  selected,
  onSelect,
  score,
  size = "md",
}: {
  pillars: Pillar[];
  previous?: Pillar[];
  selected: PillarId | null;
  onSelect: (id: PillarId | null) => void;
  score: number;
  size?: "md" | "lg";
}) {
  const reduce = useReducedMotion();
  const byId = new Map(pillars.map((p) => [p.id, p]));
  const prevById = new Map(previous?.map((p) => [p.id, p]) ?? []);

  return (
    <svg viewBox="-26 -26 372 372" className={cn("w-full", size === "lg" ? "max-w-[400px]" : "max-w-[340px]")} role="group" aria-label={`Seu Lastro: ${score} de 100`}>
      <defs>
        <radialGradient id="lastro-core" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#1b222b" />
          <stop offset="100%" stopColor="#0b0d10" />
        </radialGradient>
        <filter id="lastro-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>

      {/* faint orbit guides */}
      <circle cx={CENTER} cy={CENTER} r={R_START + RINGS * (RING + RING_GAP) + 6} fill="none" stroke="rgba(255,255,255,0.04)" strokeDasharray="1 5" />

      {SECTOR_ORDER.map((id, si) => {
        const p = byId.get(id)!;
        const level = p.value * RINGS;
        const full = Math.floor(level + 1e-6);
        const frac = level - full;
        const prevFull = Math.floor((prevById.get(id)?.value ?? p.value) * RINGS + 1e-6);
        const dim = selected !== null && selected !== id;
        const labelPos = polar(CENTER, CENTER, R_START + RINGS * (RING + RING_GAP) + 18, si * 60);

        return (
          <g
            key={id}
            role="button"
            tabIndex={0}
            aria-label={`${p.label}: ${Math.round(p.value * 100)}%`}
            aria-pressed={selected === id}
            onClick={() => onSelect(selected === id ? null : id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(selected === id ? null : id);
              }
            }}
            className="cursor-pointer outline-none [&:focus-visible_path]:stroke-off/60"
            style={{ opacity: dim ? 0.28 : 1, transition: "opacity 300ms var(--ease-lastro)" }}
          >
            {Array.from({ length: RINGS }, (_, ri) => {
              const r0 = R_START + ri * (RING + RING_GAP);
              const r1 = r0 + RING;
              const [a0, a1] = sectorAngles(si, r1);
              const d = annularSector(CENTER, CENTER, r0, r1, a0, a1);
              const filled = ri < full;
              const partial = ri === full && frac > 0.05;
              const isNew = filled && ri >= prevFull;
              const opacity = filled ? 0.55 + 0.45 * ((ri + 1) / RINGS) : partial ? 0.18 + 0.3 * frac : 1;
              return (
                <g key={ri}>
                  {isNew && !reduce && (
                    <motion.path
                      d={d}
                      fill={p.color}
                      filter="url(#lastro-glow)"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 0.9, 0.25] }}
                      transition={{ duration: 2.2, delay: 0.8 + ri * 0.08, ease: "easeOut" }}
                    />
                  )}
                  <motion.path
                    d={d}
                    fill={filled || partial ? p.color : "rgba(255,255,255,0.045)"}
                    initial={reduce ? false : { opacity: 0, scale: 0.92 }}
                    animate={{ opacity: filled || partial ? opacity : 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: reduce ? 0 : 0.1 + ri * 0.055 + si * 0.025, ease: [0.22, 1, 0.36, 1] }}
                    style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
                  />
                </g>
              );
            })}
            {/* invisible hit area covering the whole sector */}
            <path
              d={annularSector(CENTER, CENTER, R_START - 4, R_START + RINGS * (RING + RING_GAP) + 26, si * 60 - 30, si * 60 + 30)}
              fill="transparent"
            />
            <text
              x={labelPos.x}
              y={labelPos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="font-sans"
              fontSize="10"
              fontWeight="600"
              letterSpacing="0.1em"
              fill={selected === id ? p.color : "#69717D"}
            >
              {p.short}
            </text>
          </g>
        );
      })}

      {/* core */}
      <circle cx={CENTER} cy={CENTER} r={R_START - 7} fill="url(#lastro-core)" stroke="rgba(255,255,255,0.06)" />
      <foreignObject x={CENTER - 50} y={CENTER - 34} width={100} height={68} pointerEvents="none">
        <div className="flex h-full flex-col items-center justify-center">
          <span className="text-[8.5px] font-semibold tracking-[0.18em] text-muted">LASTRO</span>
          <AnimatedNumber value={score} format={(n) => String(Math.round(n))} duration={1.4} className="font-display text-[34px] leading-none font-semibold tracking-[-0.04em] text-off tabular" />
        </div>
      </foreignObject>
    </svg>
  );
}

export function LastroScoreCard({ className }: { className?: string }) {
  const { state, today } = useFinance();
  const [selected, setSelected] = useState<PillarId | null>(null);

  const { score, pillars } = useMemo(() => lastroScore(state, today), [state, today]);
  const prev = useMemo(() => lastroScore(state, addDays(today, -7)), [state, today]);
  const delta = score - prev.score;
  const level = lastroLevel(score);

  const ordered = SECTOR_ORDER.map((id) => pillars.find((p) => p.id === id)!);
  const strongest = [...pillars].sort((a, b) => b.value - a.value)[0];
  // Next step: the pillar with the most weighted room to grow.
  const nextStep = [...pillars].sort((a, b) => (1 - b.value) * b.weight - (1 - a.value) * a.weight)[0];
  const sel = selected ? pillars.find((p) => p.id === selected)! : null;

  return (
    <section id="lastro" aria-labelledby="lastro-title" className={cn("card-raised relative overflow-hidden p-5 sm:p-6", className)}>
      <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-green/[0.06] blur-3xl" aria-hidden />
      <div className="relative flex items-start justify-between">
        <div>
          <h2 id="lastro-title" className="font-display text-[19px] font-semibold tracking-[-0.02em]">
            Seu Lastro
          </h2>
          <p className="mt-0.5 text-[13px] text-soft">A base da sua vida financeira</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[12px] font-semibold text-off">Nível {level.name}</span>
          {delta !== 0 && (
            <span className={cn("flex items-center gap-0.5 text-[12px] font-semibold", delta > 0 ? "text-green" : "text-soft")}>
              {delta > 0 && <ArrowUpRight className="size-3.5" />}
              {delta > 0 ? `+${delta}` : delta} em 7 dias
            </span>
          )}
        </div>
      </div>

      <div className="relative mt-2 flex justify-center">
        <LastroViz pillars={pillars} previous={prev.pillars} selected={selected} onSelect={setSelected} score={score} />
      </div>

      <div className="relative mt-1 min-h-[76px]">
        <AnimatePresence mode="wait" initial={false}>
          {sel ? (
            <motion.div
              key={sel.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
              className="flex items-center justify-between gap-3 rounded-[18px] bg-white/[0.04] p-4"
            >
              <div>
                <p className="flex items-center gap-2 text-[14px] font-semibold">
                  <span className="size-2 rounded-full" style={{ background: sel.color }} />
                  {sel.label} · {Math.round(sel.value * 100)}%
                </p>
                <p className="mt-0.5 text-[13px] text-soft">{sel.detail}</p>
              </div>
              <Link href={sel.href} className="pressable grid size-10 shrink-0 place-items-center rounded-full bg-white/[0.07] hover:bg-white/[0.12]" aria-label={`Abrir ${sel.label}`}>
                <ArrowRight className="size-4" />
              </Link>
            </motion.div>
          ) : (
            <motion.div key="summary" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="grid grid-cols-2 gap-2">
              <button onClick={() => setSelected(strongest.id)} className="pressable rounded-[18px] bg-white/[0.04] p-3.5 text-left hover:bg-white/[0.06]">
                <p className="eyebrow !text-[10px]">Mais forte</p>
                <p className="mt-1 flex items-center gap-1.5 text-[15px] font-semibold">
                  <span className="size-2 rounded-full" style={{ background: strongest.color }} />
                  {strongest.label}
                </p>
              </button>
              <Link href={nextStep.href} className="pressable rounded-[18px] bg-white/[0.04] p-3.5 hover:bg-white/[0.06]">
                <p className="eyebrow !text-[10px]">Próximo passo</p>
                <p className="mt-1 flex items-center gap-1.5 text-[15px] font-semibold">
                  <span className="size-2 rounded-full" style={{ background: nextStep.color }} />
                  Fortalecer {nextStep.label.toLowerCase()}
                </p>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ul className="relative mt-3 grid grid-cols-3 gap-x-3 gap-y-3" aria-label="Pilares do Lastro">
        {ordered.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => setSelected(selected === p.id ? null : p.id)}
              aria-pressed={selected === p.id}
              className={cn("w-full rounded-xl p-1 text-left transition-opacity", selected && selected !== p.id && "opacity-45")}
            >
              <div className="flex items-baseline justify-between gap-1">
                <span className="truncate text-[12px] font-medium text-soft">{p.label}</span>
                <span className="text-[12px] font-semibold tabular text-off">{formatNumber(p.value * 100, 0)}</span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <motion.div className="h-full rounded-full" style={{ background: p.color }} initial={{ width: 0 }} animate={{ width: `${p.value * 100}%` }} transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }} />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
