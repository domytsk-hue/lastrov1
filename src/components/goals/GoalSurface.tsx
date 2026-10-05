"use client";

import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { goalStatus } from "@/lib/finance";
import { diffInDays, formatMonthYear } from "@/lib/format";
import type { Goal } from "@/lib/types";
import { useFinance } from "@/store/finance-store";
import { useUI } from "@/store/ui-store";
import { AnimatedPercentage, Money } from "@/components/ui/AnimatedNumber";
import { FinancialSurface } from "@/components/surfaces/Surface";
import { ProgressPath } from "@/components/surfaces/ProgressPath";
import { goalKind } from "./goal-kinds";

/** Each goal gets its own geometric emblem — collectible, not generic. */
function Emblem({ color, seed }: { color: string; seed: number }) {
  const v = seed % 3;
  return (
    <svg viewBox="0 0 120 120" className="pointer-events-none absolute -top-8 -right-8 size-40 opacity-90" aria-hidden>
      {v === 0 && (
        <>
          <circle cx="60" cy="60" r="44" fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="14" />
          <circle cx="60" cy="60" r="18" fill={color} fillOpacity="0.55" />
        </>
      )}
      {v === 1 && (
        <>
          <rect x="22" y="22" width="76" height="76" rx="26" fill={color} fillOpacity="0.22" transform="rotate(18 60 60)" />
          <rect x="40" y="40" width="40" height="40" rx="14" fill={color} fillOpacity="0.5" transform="rotate(18 60 60)" />
        </>
      )}
      {v === 2 && (
        <>
          <path d="M20 90 A40 40 0 0 1 100 90" fill="none" stroke={color} strokeOpacity="0.4" strokeWidth="16" strokeLinecap="round" />
          <circle cx="60" cy="88" r="12" fill={color} fillOpacity="0.6" />
        </>
      )}
    </svg>
  );
}

export function GoalSurface({ goal, index = 0, size = "md", className, onEdit }: { goal: Goal; index?: number; size?: "md" | "lg"; className?: string; onEdit?: () => void }) {
  const { state, today } = useFinance();
  const { openComposer } = useUI();
  const s = goalStatus(state, goal, today);
  const k = goalKind(goal.kind);
  const big = size === "lg";

  let paceNote: React.ReactNode = null;
  if (big && s.remaining > 0 && goal.targetDate && s.eta) {
    const months = Math.round(diffInDays(goal.targetDate, s.eta) / 30.4);
    paceNote =
      months > 0 ? `${months} ${months === 1 ? "mês" : "meses"} antes do prazo.` : months < 0 ? (
        <>
          Para chegar em {formatMonthYear(goal.targetDate)}: <Money value={s.neededMonthly ?? 0} />/mês.
        </>
      ) : (
        "No prazo certinho."
      );
  }

  return (
    <FinancialSurface
      tone="light"
      radius={index % 2 ? "organicR" : "organic"}
      interactive
      className={cn("flex flex-col", className)}
      style={{ background: `linear-gradient(155deg, #ffffff 0%, ${goal.color}1c 100%)` }}
    >
      <Emblem color={goal.color} seed={index + goal.name.length} />
      {onEdit && (
        <button onClick={onEdit} className="absolute top-4 right-4 z-10 grid size-10 place-items-center rounded-full bg-white/80 text-ink-700 shadow-[0_6px_16px_-8px_rgba(22,80,180,0.5)] active:scale-95" aria-label={`Editar ${goal.name}`}>
          <Pencil className="size-4" />
        </button>
      )}
      <Link href={`/metas#${goal.id}`} id={big ? goal.id : undefined} className="relative block scroll-mt-32 p-5 pb-3 sm:p-6 sm:pb-3">
        <p className="flex items-center gap-2 text-[13px] font-bold tracking-[0.14em] uppercase" style={{ color: goal.color }}>
          <k.icon className="size-4" />
          {goal.name}
        </p>
        <AnimatedPercentage value={s.progress} className={cn("mt-4 font-display leading-none font-semibold tracking-[-0.045em] text-ink-900", big ? "text-[72px]" : "text-[56px]")} />
        <div className="mt-5">
          <ProgressPath value={s.progress} color={goal.color} />
        </div>
        <div className="mt-2 flex items-baseline justify-between text-[14px]">
          <span className="font-semibold text-ink-900">
            <Money value={s.saved} />
          </span>
          <span className="text-ink-500">
            <Money value={goal.target} />
          </span>
        </div>
        <p className="mt-3 text-[14px] text-ink-700">
          {s.remaining === 0 ? "Conquistada." : s.eta ? <>Chega em {formatMonthYear(s.eta)}</> : "Defina um aporte mensal"}
        </p>
        {paceNote && <p className="mt-1 text-[14px] text-ink-500">{paceNote}</p>}
      </Link>
      <div className="relative mt-auto px-5 pb-5 sm:px-6 sm:pb-6">
        <button
          onClick={() => openComposer({ type: "transfer", goalId: goal.id })}
          className="flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-midnight text-[14px] font-semibold text-white transition-transform active:scale-[0.97]"
        >
          <Plus className="size-4" /> Guardar
        </button>
      </div>
    </FinancialSurface>
  );
}
