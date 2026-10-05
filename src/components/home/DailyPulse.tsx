"use client";

import { Sparkles } from "lucide-react";
import { useMemo } from "react";
import { getCategory } from "@/data/categories";
import { cn } from "@/lib/cn";
import { pulse } from "@/lib/finance";
import { formatNumber, monthName, parseISODate, weekdayName } from "@/lib/format";
import { useFinance } from "@/store/finance-store";
import { useUI } from "@/store/ui-store";
import { WeekBars } from "@/components/charts/WeekBars";
import { Money, MoneyValue } from "@/components/ui/MoneyValue";
import { STATE_COLOR, StateBadge } from "@/components/ui/primitives";

/** Pulso — the daily snapshot. A ten-second ritual. */
export function DailyPulse({ className }: { className?: string }) {
  const { state, today } = useFinance();
  const { openComposer } = useUI();
  const p = useMemo(() => pulse(state, today), [state, today]);
  const d = parseISODate(today);

  return (
    <section aria-labelledby="pulse-title" className={cn("card relative overflow-hidden p-5", className)}>
      <header className="flex items-center justify-between">
        <h2 id="pulse-title" className="flex items-center gap-2">
          <span className="relative flex size-2">
            <span className="live-dot absolute inset-0 rounded-full bg-green" />
          </span>
          <span className="eyebrow !text-off">Pulso de hoje</span>
        </h2>
        <span className="text-[12px] font-medium text-muted">
          {weekdayName(today, true)}, {d.getDate()} {monthName(today, true)}
        </span>
      </header>

      <div className="mt-4 grid grid-cols-[1fr_1.15fr] items-end gap-5">
        <div>
          <p className="text-[13px] text-soft">Gasto hoje</p>
          <MoneyValue value={p.variableToday} size="xl" cents={p.variableToday % 1 !== 0} className="mt-1" />
          {p.spentToday - p.variableToday > 0.5 && (
            <p className="mt-1.5 text-[12px] text-muted">
              + <Money value={p.spentToday - p.variableToday} /> em contas fixas
            </p>
          )}
        </div>
        <WeekBars data={p.week} today={today} height={64} />
      </div>

      <dl className="mt-5 grid grid-cols-3 divide-x divide-white/[0.06] rounded-[18px] bg-white/[0.03] py-3">
        <div className="px-3">
          <dt className="text-[11px] font-medium text-muted">Orçamento</dt>
          <dd className="mt-1">
            <StateBadge state={p.budgetState} className="!px-0 !bg-transparent" />
          </dd>
        </div>
        <div className="px-3">
          <dt className="text-[11px] font-medium text-muted">Metas</dt>
          <dd className={cn("mt-1 text-[14px] font-semibold", p.goalsToday > 0 ? "text-yellow" : "text-soft")}>
            {p.goalsToday > 0 ? <Money value={p.goalsToday} sign /> : "—"}
          </dd>
        </div>
        <div className="px-3">
          <dt className="text-[11px] font-medium text-muted">Patrimônio</dt>
          <dd className={cn("mt-1 text-[14px] font-semibold tabular", p.netWorthDelta > 0 ? "text-green" : "text-soft")}>
            {p.netWorthDelta > 0 ? "+" : p.netWorthDelta < 0 ? "−" : ""}
            {formatNumber(Math.abs(p.netWorthDelta) * 100, 1)}%
          </dd>
        </div>
      </dl>

      <p className="mt-4 flex items-start gap-2 text-[14px] leading-snug text-off">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-purple-light" aria-hidden />
        <span>
          {p.insight}
          {p.worstBudget && p.worstBudget.state !== "healthy" && (
            <span className="text-soft">
              {" "}
              <span style={{ color: STATE_COLOR[p.worstBudget.state] }}>{getCategory(p.worstBudget.categoryId).name}</span> pede atenção: <Money value={p.worstBudget.dailyAllowance} />
              /dia até o fim do mês.
            </span>
          )}
        </span>
      </p>

      {p.count === 0 && (
        <button onClick={() => openComposer({ type: "expense" })} className="pressable mt-4 h-11 w-full rounded-[14px] bg-white/[0.06] text-[14px] font-semibold text-off hover:bg-white/[0.1]">
          Registrar o primeiro gasto de hoje
        </button>
      )}
    </section>
  );
}
