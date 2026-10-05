"use client";

import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { goalStatus, reserveStatus } from "@/product/domain/finance";
import { formatNumber } from "@/lib/format";
import type { Goal } from "@/product/domain/types";
import { useFinance } from "@/product/store/finance-store";
import { GoalSheet } from "@/components/product/goals/GoalSheet";
import { GoalSurface } from "@/components/product/goals/GoalSurface";
import { ProtectionLayers } from "@/components/shared/data-viz/ProtectionLayers";
import { AnimatedMoney, Money } from "@/components/shared/motion/AnimatedNumber";
import { Button, EmptyState, PageHeader } from "@/components/shared/ui/primitives";
import { Capsule, FinancialSurface } from "@/components/shared/surfaces/Surface";
import { ROUTES } from "@/config/routes";

export function GoalsScreen() {
  const { state, today } = useFinance();
  const [sheet, setSheet] = useState<{ goal?: Goal } | null>(null);
  const r = reserveStatus(state, today);
  const totalSaved = state.goals.reduce((s, g) => s + goalStatus(state, g, today).saved, 0);
  const thisMonth = state.goals.reduce((s, g) => s + goalStatus(state, g, today).thisMonth, 0);

  return (
    <>
      <PageHeader
        eyebrow="O que você está construindo"
        title="Metas"
        action={
          <Button size="sm" onClick={() => setSheet({})}>
            <Plus className="size-4" /> Nova meta
          </Button>
        }
      />

      <div className="mb-10 grid gap-6 lg:grid-cols-12 lg:items-center">
        <div className="px-1 lg:col-span-7">
          <AnimatedMoney value={totalSaved} size="display" cents={false} className="text-ink-900" />
          <p className="mt-2 text-[18px] font-medium text-ink-700">guardados para o que importa.</p>
          <div className="mt-4">{thisMonth > 0 ? <Capsule tone="mint">+<Money value={thisMonth} /> este mês</Capsule> : <Capsule tone="tint">Nenhum aporte este mês ainda</Capsule>}</div>
        </div>
        <FinancialSurface tone="navy" radius="organicR" interactive className="lg:col-span-5">
          <Link href={ROUTES.reserva} className="flex items-center gap-5 p-5">
            <ProtectionLayers months={r.months} target={state.reserve.targetMonths} size={96} compact />
            <div className="flex-1">
              <p className="font-display text-[34px] leading-none font-semibold">{formatNumber(r.months, 1)}</p>
              <p className="mt-1 text-[15px] text-white/70">meses de reserva</p>
            </div>
            <ArrowRight className="size-5 text-white/60" />
          </Link>
        </FinancialSurface>
      </div>

      {state.goals.length === 0 ? (
        <FinancialSurface tone="light" radius="xl">
          <EmptyState title="Toda conquista começa com um nome." body="Crie sua primeira meta e veja quando você chega lá." action={<Button onClick={() => setSheet({})}>Criar meta</Button>} />
        </FinancialSurface>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {state.goals.map((g, i) => (
            <GoalSurface key={g.id} goal={g} index={i} size="lg" onEdit={() => setSheet({ goal: g })} className={i % 2 ? "md:mt-10" : ""} />
          ))}
        </div>
      )}

      <GoalSheet open={!!sheet} goal={sheet?.goal} onClose={() => setSheet(null)} />
    </>
  );
}
