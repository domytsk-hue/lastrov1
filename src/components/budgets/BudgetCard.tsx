"use client";

import { motion, useReducedMotion } from "framer-motion";
import { getCategory } from "@/data/categories";
import { cn } from "@/lib/cn";
import type { BudgetStatus } from "@/lib/finance";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { Money, MoneyValue } from "@/components/ui/MoneyValue";
import { ProgressBar } from "@/components/ui/Progress";
import { STATE_COLOR, StateBadge } from "@/components/ui/primitives";

/**
 * A budget as a living object: the card fills like a vessel as the month is spent,
 * and its colour shifts only when it needs attention.
 */
export function BudgetCard({ b, onClick }: { b: BudgetStatus; onClick?: () => void }) {
  const reduce = useReducedMotion();
  const cat = getCategory(b.categoryId);
  const color = b.state === "healthy" ? cat.color : STATE_COLOR[b.state];
  const fill = Math.min(1, b.pct);

  return (
    <button onClick={onClick} className="card pressable group relative w-full overflow-hidden p-5 text-left hover:border-white/10">
      {/* liquid level */}
      <motion.div
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{ background: `linear-gradient(180deg, ${color}26 0%, ${color}08 100%)`, borderTop: `1px solid ${color}40` }}
        initial={reduce ? false : { height: 0 }}
        animate={{ height: `${fill * 100}%` }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        aria-hidden
      />
      <div className="relative">
        <div className="flex items-center gap-3">
          <CategoryIcon id={b.categoryId} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold">{cat.name}</p>
            <p className="text-[13px] text-soft tabular">
              <Money value={b.spent} /> de <Money value={b.limit} />
            </p>
          </div>
          <span className="font-display text-[20px] font-semibold tabular" style={{ color: b.state === "healthy" ? undefined : color }}>
            {Math.round(b.pct * 100)}%
          </span>
        </div>

        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            {b.remaining >= 0 ? (
              <>
                <MoneyValue value={b.remaining} size="lg" cents={false} />
                <p className="mt-1 text-[13px] text-soft">disponíveis</p>
              </>
            ) : (
              <>
                <MoneyValue value={-b.remaining} size="lg" cents={false} className="text-coral-light" />
                <p className="mt-1 text-[13px] text-soft">acima do planejado</p>
              </>
            )}
          </div>
          <StateBadge state={b.state} />
        </div>

        <ProgressBar value={b.pct} color={color} height={6} marker={b.fixed ? undefined : b.monthProgress} className="mt-4" label={`${cat.name}: ${Math.round(b.pct * 100)}%`} />

        <p className={cn("mt-3 text-[13px] leading-snug", b.state === "healthy" ? "text-soft" : "text-off")}>{budgetAdvice(b)}</p>
      </div>
    </button>
  );
}

export function budgetAdvice(b: BudgetStatus): React.ReactNode {
  const cat = getCategory(b.categoryId).name;
  if (b.state === "exceeded") {
    return (
      <>
        {cat} passou <Money value={-b.remaining} /> do planejado. Ainda dá para ajustar o restante do mês.
      </>
    );
  }
  if (b.fixed) {
    return b.spent > 0 ? "Contas fixas em dia. O restante já está reservado." : "Contas fixas ainda por vir este mês.";
  }
  if (b.state === "healthy") {
    return (
      <>
        Dá para gastar cerca de <strong className="font-semibold text-off"><Money value={b.dailyAllowance} />/dia</strong> até o fim do mês.
      </>
    );
  }
  return (
    <>
      Neste ritmo, termina em <Money value={b.projected} />. Segurar em <strong className="font-semibold"><Money value={b.dailyAllowance} />/dia</strong> resolve.
    </>
  );
}
