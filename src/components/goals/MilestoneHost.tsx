"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { goalSaved, pendingMilestone } from "@/lib/finance";
import { formatBRL } from "@/lib/format";
import { useFinance } from "@/store/finance-store";
import { Button } from "@/components/ui/primitives";
import { ProgressRing } from "@/components/ui/Progress";

const COPY: Record<number, string> = {
  25: "Um quarto do caminho.",
  50: "Metade do caminho.",
  75: "Três quartos. A reta final começou.",
  100: "Meta completa.",
};

/**
 * Celebrates goal milestones (25/50/75/100%) once each — refined, not confetti.
 * Lives in the shell so it fires wherever the contribution happened.
 */
export function MilestoneHost() {
  const { state, dispatch } = useFinance();
  const reduce = useReducedMotion();
  const [current, setCurrent] = useState<{ goalId: string; milestone: number } | null>(null);

  useEffect(() => {
    if (current) return;
    for (const g of state.goals) {
      const m = pendingMilestone(g, goalSaved(state, g));
      if (m) {
        setCurrent({ goalId: g.id, milestone: m });
        if ("vibrate" in navigator) navigator.vibrate?.([12, 60, 20]);
        return;
      }
    }
  }, [state, current]);

  const goal = current ? state.goals.find((g) => g.id === current.goalId) : undefined;
  const close = () => {
    if (current) dispatch({ type: "goal/celebrated", id: current.goalId, milestone: current.milestone });
    setCurrent(null);
  };

  return (
    <AnimatePresence>
      {goal && current && (
        <motion.div className="fixed inset-0 z-[70] grid place-items-center bg-black/75 p-6 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`${goal.name}: ${current.milestone}%`}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm overflow-hidden rounded-[32px] border border-white/10 bg-[#0e1115] p-7 text-center"
            initial={reduce ? { opacity: 0 } : { scale: 0.92, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
          >
            <div className="pointer-events-none absolute -top-24 left-1/2 size-64 -translate-x-1/2 rounded-full blur-3xl" style={{ background: `${goal.color}33` }} />
            {!reduce &&
              [0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="pointer-events-none absolute top-[88px] left-1/2 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border"
                  style={{ borderColor: goal.color }}
                  initial={{ scale: 0.8, opacity: 0.6 }}
                  animate={{ scale: 2.4, opacity: 0 }}
                  transition={{ duration: 1.8, delay: 0.3 + i * 0.35, ease: "easeOut" }}
                />
              ))}
            <div className="relative mx-auto w-fit">
              <ProgressRing value={current.milestone / 100} size={112} stroke={8} color={goal.color}>
                <span className="font-display text-[30px] font-semibold tabular">{current.milestone}%</span>
              </ProgressRing>
            </div>
            <p className="relative mt-6 text-[12px] font-semibold tracking-[0.14em] uppercase" style={{ color: goal.color }}>
              {goal.name}
            </p>
            <p className="relative mt-2 font-display text-[24px] leading-tight font-semibold tracking-[-0.02em]">{COPY[current.milestone]}</p>
            <p className="relative mt-2 text-[14px] text-soft">
              {current.milestone === 100 ? `Você juntou ${formatBRL(goal.target, { cents: false })}. Isso é constância.` : `Faltam ${formatBRL(Math.max(0, goal.target - goalSaved(state, goal)), { cents: false })}. Bom ritmo.`}
            </p>
            <Button className="relative mt-6 w-full" onClick={close} autoFocus>
              Continuar
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
