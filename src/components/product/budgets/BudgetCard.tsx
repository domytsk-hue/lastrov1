"use client";

import { getCategory } from "@/product/data/categories";
import type { BudgetStatus } from "@/product/domain/finance";
import { AnimatedMoney, Money } from "@/components/shared/motion/AnimatedNumber";
import { categoryIcon } from "@/components/product/ui/CategoryIcon";
import { STATE_COLOR, StateBadge } from "@/components/product/ui/FinanceChips";
import { CurvedGauge } from "@/components/shared/surfaces/CurvedGauge";
import { FinancialSurface } from "@/components/shared/surfaces/Surface";

/**
 * A budget answers one question: what can I still spend?
 * Remaining money first, its daily translation second, the percentage only as a shape.
 */
export function BudgetCard({ b, onClick, index = 0 }: { b: BudgetStatus; onClick?: () => void; index?: number }) {
  const cat = getCategory(b.categoryId);
  const Icon = categoryIcon(b.categoryId);
  const over = b.remaining < 0;
  const color = b.state === "healthy" ? cat.color : STATE_COLOR[b.state];

  return (
    <FinancialSurface tone="light" radius={index % 2 ? "organicR" : "organic"} interactive>
      <button onClick={onClick} className="block w-full p-6 text-left" aria-label={`${cat.name}: editar orçamento`}>
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[13px] font-bold tracking-[0.14em] uppercase" style={{ color: cat.color }}>
            <Icon className="size-4" />
            {cat.name}
          </p>
          {b.state !== "healthy" && <StateBadge state={b.state} />}
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3">
          <div>
            <AnimatedMoney value={Math.abs(b.remaining)} size="xl" cents={false} className={over ? "text-rose-ink" : "text-ink-900"} />
            <p className="mt-1 text-[16px] font-medium text-ink-700">{over ? "acima do plano" : "livres"}</p>
          </div>
          <CurvedGauge value={b.pct} marker={b.fixed ? undefined : b.monthProgress} size={96} color={color} />
        </div>
        <p className="mt-4 text-[15px] leading-snug text-ink-900">{budgetAdvice(b)}</p>
        <p className="mt-2 text-[13px] text-ink-400">
          <Money value={b.spent} /> usados de <Money value={b.limit} />
        </p>
      </button>
    </FinancialSurface>
  );
}

export function budgetAdvice(b: BudgetStatus): React.ReactNode {
  if (b.state === "exceeded") return <>Ainda dá para ajustar o restante do mês.</>;
  if (b.fixed) return b.spent > 0 ? "Contas fixas em dia." : "Contas fixas ainda por vir.";
  if (b.state === "healthy")
    return (
      <>
        ≈ <strong className="font-semibold"><Money value={b.dailyAllowance} /> por dia</strong> até o fim do mês.
      </>
    );
  return (
    <>
      Merece atenção. Segurar em <strong className="font-semibold"><Money value={b.dailyAllowance} />/dia</strong> resolve.
    </>
  );
}
