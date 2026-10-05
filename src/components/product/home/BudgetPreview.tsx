"use client";

import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { getCategory } from "@/product/data/categories";
import { allBudgets } from "@/product/domain/finance";
import { useFinance } from "@/product/store/finance-store";
import { AnimatedMoney, Money } from "@/components/shared/motion/AnimatedNumber";
import { CurvedGauge } from "@/components/shared/surfaces/CurvedGauge";
import { FinancialSurface } from "@/components/shared/surfaces/Surface";
import { ROUTES } from "@/config/routes";

/** What can I still spend? One number, its daily translation, and one line of attention. */
export function BudgetPreview({ className }: { className?: string }) {
  const { state, today } = useFinance();
  const list = useMemo(() => allBudgets(state, today).filter((b) => !b.fixed), [state, today]);

  if (list.length === 0) {
    return (
      <FinancialSurface tone="light" radius="organicR" interactive className={className}>
        <Link href={ROUTES.orcamentos} className="flex items-center gap-4 p-6">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-midnight text-white">
            <Plus className="size-5" />
          </span>
          <span className="flex-1">
            <span className="block font-display text-[20px] font-semibold">Quanto dá para gastar por dia?</span>
            <span className="text-[14px] text-ink-500">Crie um orçamento e descubra.</span>
          </span>
        </Link>
      </FinancialSurface>
    );
  }

  const free = list.reduce((s, b) => s + Math.max(0, b.remaining), 0);
  const limit = list.reduce((s, b) => s + b.limit, 0);
  const spent = list.reduce((s, b) => s + b.spent, 0);
  const daily = list.reduce((s, b) => s + b.dailyAllowance, 0);
  const attention = [...list].filter((b) => b.state !== "healthy").sort((a, b) => b.pct - a.pct)[0];

  return (
    <FinancialSurface tone="light" radius="organicR" interactive className={className}>
      <Link href={ROUTES.orcamentos} className="block p-5 sm:p-6" aria-label="Ver orçamentos">
        <div className="flex items-center justify-between">
          <span className="eyebrow text-ink-500">Orçamento do mês</span>
          <ArrowRight className="size-5 text-ink-400" />
        </div>
        <div className="mt-2 grid grid-cols-[1fr_auto] items-end gap-4">
          <div>
            <AnimatedMoney value={free} size="xl" cents={false} className="text-ink-900" />
            <p className="mt-1 text-[16px] font-medium text-ink-700">livres</p>
            <p className="mt-3 inline-flex items-center rounded-full bg-mint/15 px-3 py-1.5 text-[15px] font-semibold text-mint-ink">
              ≈ <Money value={daily} />
              &nbsp;por dia
            </p>
          </div>
          <CurvedGauge value={spent / Math.max(1, limit)} marker={list[0].monthProgress} size={128} />
        </div>
        <p className="mt-4 text-[13px] text-ink-400">
          <Money value={spent} /> usados de <Money value={limit} />
        </p>
        {attention && (
          <p className="mt-3 flex items-center gap-2 text-[15px] font-medium text-ink-900">
            <span className="size-2 rounded-full bg-amber" />
            {getCategory(attention.categoryId).name} merece atenção.
          </p>
        )}
      </Link>
    </FinancialSurface>
  );
}
