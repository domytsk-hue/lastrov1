"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { getCategory } from "@/product/data/categories";
import { cn } from "@/lib/cn";
import { formatBRL, formatNumber, weekdayName } from "@/lib/format";
import { duration, ease } from "@/design-system/motion";
import { pulseMood } from "@/product/domain/stories";
import { useFinance } from "@/product/store/finance-store";
import { AnimatedMoney, Money } from "@/components/shared/motion/AnimatedNumber";
import { BottomSheet } from "@/components/shared/ui/BottomSheet";
import { FinancialSurface } from "@/components/shared/surfaces/Surface";

/** PULSO — one number, one calm sentence, a tiny line. Tap for the details. */
export function PulseCard({ className }: { className?: string }) {
  const { state, today } = useFinance();
  const [open, setOpen] = useState(false);
  const mood = useMemo(() => pulseMood(state, today), [state, today]);
  const { p } = mood;

  return (
    <>
      <FinancialSurface tone="light" radius="organic" interactive className={cn("cursor-pointer", className)}>
        <button onClick={() => setOpen(true)} className="block w-full p-5 text-left sm:p-6" aria-label="Abrir Pulso de hoje">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="live-dot size-2 rounded-full bg-mint" />
              <span className="eyebrow text-ink-500">Pulso · hoje</span>
            </span>
            <ChevronRight className="size-5 text-ink-400" />
          </div>
          <div className="mt-4 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <AnimatedMoney value={p.variableToday} size="xl" cents={p.variableToday % 1 !== 0} className="text-ink-900" />
              <p className="mt-3 font-display text-[19px] leading-tight font-semibold tracking-[-0.015em] text-ink-900">{mood.title}</p>
              <p className="mt-1 text-[14px] text-ink-500">{mood.detail}</p>
            </div>
            <Spark data={p.week.map((d) => d.value)} />
          </div>
        </button>
      </FinancialSurface>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Pulso de hoje" description={mood.title}>
        <PulseDetail />
      </BottomSheet>
    </>
  );
}

/** A 7-point line. Today is the mint dot. */
function Spark({ data }: { data: number[] }) {
  const reduce = useReducedMotion();
  const W = 96;
  const H = 48;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => ({ x: 4 + (i / (data.length - 1)) * (W - 8), y: H - 6 - (v / max) * (H - 14) }));
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 overflow-visible" aria-hidden>
      <motion.path d={d} fill="none" stroke="#8CCBFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: duration.reveal, ease: ease.out }} />
      <circle cx={last.x} cy={last.y} r="5" fill="#18E0AE" stroke="white" strokeWidth="2.5" />
    </svg>
  );
}

function PulseDetail() {
  const { state, today } = useFinance();
  const { p } = useMemo(() => pulseMood(state, today), [state, today]);
  const max = Math.max(...p.week.map((d) => d.value), 1);
  return (
    <div className="flex flex-col gap-6 pb-2">
      <div>
        <p className="mb-3 text-[14px] font-medium text-ink-500">Últimos 7 dias</p>
        <div className="flex h-32 items-end gap-2">
          {p.week.map((d, i) => {
            const isToday = d.date === today;
            return (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-2">
                <motion.div
                  className={cn("w-full rounded-full", isToday ? "bg-mint" : "bg-sky/70")}
                  initial={{ height: 6 }}
                  animate={{ height: Math.max(6, (d.value / max) * 104) }}
                  transition={{ duration: duration.slow, delay: i * 0.04, ease: ease.out }}
                  aria-label={`${weekdayName(d.date)}: ${formatBRL(d.value)}`}
                  role="img"
                />
                <span className={cn("text-[11px] font-semibold uppercase", isToday ? "text-ink-900" : "text-ink-400")}>{weekdayName(d.date, true).slice(0, 3)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <Stat label="Gasto do dia a dia" value={<Money value={p.variableToday} cents />} />
        <Stat label="Contas fixas hoje" value={<Money value={p.spentToday - p.variableToday} />} />
        <Stat label="Guardado hoje" value={p.goalsToday > 0 ? <Money value={p.goalsToday} sign /> : "—"} />
        <Stat label="Patrimônio" value={`${p.netWorthDelta >= 0 ? "+" : "−"}${formatNumber(Math.abs(p.netWorthDelta) * 100, 1)}%`} />
      </dl>
      {p.worstBudget && p.worstBudget.state !== "healthy" && (
        <p className="rounded-[22px] bg-amber/12 p-4 text-[15px] text-ink-900">
          <strong className="font-semibold">{getCategory(p.worstBudget.categoryId).name}</strong> merece atenção: cerca de <Money value={p.worstBudget.dailyAllowance} />/dia até o fim do mês.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[22px] bg-white p-4 shadow-[0_8px_20px_-14px_rgba(22,80,180,0.4)]">
      <dt className="text-[13px] text-ink-500">{label}</dt>
      <dd className="mt-1 font-display text-[20px] font-semibold text-ink-900">{value}</dd>
    </div>
  );
}
