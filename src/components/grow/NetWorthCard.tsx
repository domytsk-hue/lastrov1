"use client";

import { ArrowRight, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { netWorthChange, netWorthSeries } from "@/lib/finance";
import { useFinance } from "@/store/finance-store";
import { NetWorthChart } from "@/components/charts/NetWorthChart";
import { Money, MoneyValue } from "@/components/ui/MoneyValue";

export function NetWorthCard({ height = 180, link = true }: { height?: number; link?: boolean }) {
  const { state, today } = useFinance();
  const series = useMemo(() => netWorthSeries(state, today), [state, today]);
  const change = useMemo(() => netWorthChange(state, today), [state, today]);

  return (
    <section aria-labelledby="nw-title" className="card-raised p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="nw-title" className="text-[13px] font-medium text-soft">
            Patrimônio
          </h2>
          <MoneyValue value={change.now} size="xl" cents={false} className="mt-1" />
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[13px] text-soft">
            {series.length > 1 ? (
              <>
                <span className="flex items-center gap-1 font-semibold text-green">
                  <TrendingUp className="size-3.5" />
                  <Money value={change.yearDelta} sign />
                </span>
                em {series.length - 1} {series.length === 2 ? "mês" : "meses"}
              </>
            ) : (
              "Hoje é o primeiro ponto da sua história."
            )}
            {change.record && <span className="rounded-full bg-yellow/12 px-2 py-0.5 text-[11px] font-semibold text-yellow">Recorde</span>}
          </p>
        </div>
        {link && (
          <Link href="/crescer" className="pressable grid size-10 place-items-center rounded-full bg-white/[0.06] hover:bg-white/[0.1]" aria-label="Ver patrimônio">
            <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
      <div className="mt-6">
        <NetWorthChart series={series} milestones={state.milestones} height={height} />
      </div>
      {change.yearDelta > 0 && series.length > 1 && <p className="mt-4 text-[14px] text-off">Sua vida financeira está avançando.</p>}
    </section>
  );
}
