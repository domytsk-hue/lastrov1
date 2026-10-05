"use client";

import { ArrowRight, Plus, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { goalStatus, reserveStatus } from "@/lib/finance";
import { formatNumber } from "@/lib/format";
import type { Goal } from "@/lib/types";
import { useFinance } from "@/store/finance-store";
import { GoalCard } from "@/components/goals/GoalCard";
import { GoalSheet } from "@/components/goals/GoalSheet";
import { Money, MoneyValue } from "@/components/ui/MoneyValue";
import { ProgressBar } from "@/components/ui/Progress";
import { Button, EmptyState, PageHeader } from "@/components/ui/primitives";

export function GoalsScreen() {
  const { state, today } = useFinance();
  const [sheet, setSheet] = useState<{ goal?: Goal } | null>(null);
  const r = reserveStatus(state, today);
  const totalSaved = state.goals.reduce((s, g) => s + goalStatus(state, g, today).saved, 0);
  const totalTarget = state.goals.reduce((s, g) => s + g.target, 0);
  const thisMonth = state.goals.reduce((s, g) => s + goalStatus(state, g, today).thisMonth, 0);

  return (
    <>
      <PageHeader
        eyebrow="Planejar"
        title="Metas"
        action={
          <Button size="sm" onClick={() => setSheet({})}>
            <Plus className="size-4" /> Nova meta
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <p className="text-[13px] text-soft">Guardado para suas metas</p>
          <div className="mt-1 flex items-baseline gap-2">
            <MoneyValue value={totalSaved} size="xl" cents={false} />
            <span className="text-[14px] text-muted">
              de <Money value={totalTarget} />
            </span>
          </div>
          <p className="mt-2 text-[13px] text-soft">{thisMonth > 0 ? <>Este mês: <span className="font-semibold text-yellow">+<Money value={thisMonth} /></span></> : "Nenhum aporte este mês ainda."}</p>
        </div>
        <Link href="/reserva" className="card group flex items-center gap-4 p-5 hover:bg-surface-2">
          <span className="grid size-12 shrink-0 place-items-center rounded-[16px] bg-green/12 text-green">
            <ShieldCheck className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-soft">Reserva de emergência</p>
            <p className="font-display text-[20px] font-semibold">
              {formatNumber(r.months, 1)} de {state.reserve.targetMonths} meses
            </p>
            <ProgressBar value={r.progress} height={5} className="mt-2" />
          </div>
          <ArrowRight className="size-4 text-muted group-hover:text-off" />
        </Link>
      </div>

      {state.goals.length === 0 ? (
        <div className="card">
          <EmptyState title="Toda conquista começa com um nome." body="Crie sua primeira meta e veja quando você chega lá, no seu ritmo." action={<Button onClick={() => setSheet({})}>Criar meta</Button>} />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {state.goals.map((g) => (
            <GoalCard key={g.id} goal={g} onEdit={() => setSheet({ goal: g })} />
          ))}
        </div>
      )}

      <GoalSheet open={!!sheet} goal={sheet?.goal} onClose={() => setSheet(null)} />
    </>
  );
}
