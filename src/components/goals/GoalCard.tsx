"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { goalStatus, MILESTONES } from "@/lib/finance";
import { diffInDays, formatMonthYear } from "@/lib/format";
import type { Goal } from "@/lib/types";
import { useFinance } from "@/store/finance-store";
import { useUI } from "@/store/ui-store";
import { Money, MoneyValue } from "@/components/ui/MoneyValue";
import { goalKind } from "./goal-kinds";

/** A goal made tangible: the journey with its four milestones, the money, the date it arrives. */
export function GoalCard({ goal, onEdit }: { goal: Goal; onEdit: () => void }) {
  const { state, today } = useFinance();
  const { openComposer } = useUI();
  const reduce = useReducedMotion();
  const s = goalStatus(state, goal, today);
  const k = goalKind(goal.kind);
  const Icon = k.icon;

  let paceNote: React.ReactNode = null;
  if (s.remaining === 0) paceNote = "Meta completa. Você chegou lá.";
  else if (goal.targetDate && s.eta) {
    const months = Math.round(diffInDays(goal.targetDate, s.eta) / 30.4);
    paceNote =
      months > 0 ? (
        <>Chega {months} {months === 1 ? "mês" : "meses"} antes do prazo.</>
      ) : months < 0 ? (
        <>
          Para chegar em {formatMonthYear(goal.targetDate)}, guarde <Money value={s.neededMonthly ?? 0} />/mês.
        </>
      ) : (
        "No prazo certinho."
      );
  } else if (!s.eta) paceNote = "Defina um aporte mensal e o Lastro calcula quando você chega.";

  return (
    <article id={goal.id} className="card-raised relative scroll-mt-6 overflow-hidden p-5 sm:p-6">
      <div className="pointer-events-none absolute -top-20 -right-20 size-56 rounded-full blur-3xl" style={{ background: `${goal.color}1c` }} aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-[14px]" style={{ background: `${goal.color}1f`, color: goal.color }}>
            <Icon className="size-5" />
          </span>
          <div>
            <h3 className="font-display text-[13px] font-semibold tracking-[0.12em] uppercase" style={{ color: goal.color }}>
              {goal.name}
            </h3>
            <p className="text-[13px] text-muted">{goal.targetDate ? `Prazo: ${formatMonthYear(goal.targetDate)}` : "Sem prazo definido"}</p>
          </div>
        </div>
        <button onClick={onEdit} className="pressable grid size-9 place-items-center rounded-full bg-white/[0.05] text-soft hover:text-off" aria-label={`Editar ${goal.name}`}>
          <Pencil className="size-4" />
        </button>
      </div>

      <div className="relative mt-6 flex items-end justify-between gap-4">
        <div>
          <MoneyValue value={s.saved} size="xl" cents={false} />
          <p className="mt-1.5 text-[14px] text-soft">
            de <Money value={goal.target} />
          </p>
        </div>
        <p className="font-display text-[34px] leading-none font-semibold tracking-[-0.03em] tabular">
          {Math.round(s.progress * 100)}
          <span className="text-[18px] text-soft">%</span>
        </p>
      </div>

      {/* Journey with milestone stops */}
      <div className="relative mt-6 mb-2">
        <div className="h-2 rounded-full bg-white/[0.06]" />
        <motion.div
          className="absolute top-0 left-0 h-2 rounded-full"
          style={{ background: goal.color }}
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${s.progress * 100}%` }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        />
        {MILESTONES.map((m) => {
          const reached = s.progress * 100 >= m;
          return (
            <span
              key={m}
              className={cn("absolute top-1 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[#0f1317]", m === 100 && "-translate-x-full")}
              style={{ left: `${m}%`, background: reached ? goal.color : "#2a3038" }}
              aria-hidden
            />
          );
        })}
        <div className="mt-3 flex justify-between text-[11px] font-medium text-muted tabular" aria-hidden>
          <span>0</span>
          <span>25</span>
          <span>50</span>
          <span>75</span>
          <span>100</span>
        </div>
      </div>

      <dl className="relative mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-[16px] bg-white/[0.04] p-3.5">
          <dt className="text-[12px] text-muted">No seu ritmo</dt>
          <dd className="mt-1 text-[15px] font-semibold first-letter:uppercase">{s.remaining === 0 ? "Concluída" : s.eta ? formatMonthYear(s.eta) : "—"}</dd>
        </div>
        <div className="rounded-[16px] bg-white/[0.04] p-3.5">
          <dt className="text-[12px] text-muted">Aporte mensal</dt>
          <dd className="mt-1 text-[15px] font-semibold">{s.pace > 0 ? <Money value={s.pace} /> : "—"}</dd>
        </div>
      </dl>
      {paceNote && <p className="relative mt-3 text-[13px] text-soft">{paceNote}</p>}

      <button
        onClick={() => openComposer({ type: "transfer", goalId: goal.id })}
        className="pressable relative mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-[16px] text-[15px] font-semibold text-ink"
        style={{ background: goal.color }}
      >
        <Plus className="size-5" /> Guardar para {goal.name.toLowerCase()}
      </button>
    </article>
  );
}
